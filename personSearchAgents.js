const fs = require('fs');
const csv = require('csv-parse');
const { createObjectCsvWriter } = require('csv-writer');
const { OpenAIStream, StreamingTextResponse } = require('ai');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize AI configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_API_BASE || 'https://api.openai.com/v1',
});

// Default model setting
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

// Agent 1: Title-based filtering
class TitleFilterAgent {
    constructor() {
        this.relevantTitles = [];
        this.uniqueTitles = new Set();
    }

    async analyzeTitlesFromCSV(people) {
        // Extract unique titles from the CSV
        people.forEach(person => {
            if (person.title) {
                this.uniqueTitles.add(person.title.toLowerCase());
            }
        });

        console.log(`Found ${this.uniqueTitles.size} unique titles in the CSV`);
        console.log('All unique titles:', Array.from(this.uniqueTitles).sort());
    }

    async filterTitlesByRelevance(searchDescription) {
        const titlesArray = Array.from(this.uniqueTitles);
        
        // Extract explicit keywords from parentheses in the search description
        const explicitKeywords = [];
        const parenthesesRegex = /\(([^)]+)\)/g;
        let match;
        
        while ((match = parenthesesRegex.exec(searchDescription)) !== null) {
            const terms = match[1].split(',').map(term => term.trim().toLowerCase());
            explicitKeywords.push(...terms);
        }
        
        console.log('Explicit keywords from search prompt:', explicitKeywords);

        const prompt = `I need to find job titles related to this search prompt:
"${searchDescription}"

The search prompt may contain explicit terms in parentheses that MUST be prioritized.
Explicit terms in this prompt: ${explicitKeywords.join(', ')}

Select the most relevant job titles from this list:
${titlesArray.join(', ')}

INSTRUCTIONS:
1. Return ONLY a comma-separated list of titles with NO other text
2. Each returned title MUST EXACTLY match one from the list
3. Prioritize titles containing the explicit terms from the prompt`;

        try {
            const completion = await openai.completions.create({
                model: DEFAULT_MODEL,
                prompt: prompt,
                max_tokens: 300,
                temperature: 0.2
            });

            const rawResponse = completion.choices[0].text.trim();
            const normalizedResponse = rawResponse.replace(/\n/g, ',').replace(/,+/g, ',');
            
            const aiSuggestedTitles = normalizedResponse
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            console.log('AI suggested titles:', aiSuggestedTitles);

            // Validate AI suggestions against available titles
            const validTitles = aiSuggestedTitles.filter(title => {
                const titleLower = title.toLowerCase();
                const hasExactMatch = Array.from(this.uniqueTitles).some(t => 
                    t.toLowerCase() === titleLower
                );
                
                if (!hasExactMatch) {
                    console.log(`Rejected title (no exact match): "${title}"`);
                }
                
                return hasExactMatch;
            });

            // Always use our own keyword matching for the explicit keywords too
            // This ensures we don't miss any relevant titles
            const manualMatches = [];
            
            if (explicitKeywords.length > 0) {
                const titlesLower = titlesArray.map(t => t.toLowerCase());
                
                for (const title of titlesLower) {
                    // Direct keyword match
                    const matchedKeywords = explicitKeywords.filter(keyword => 
                        title.includes(keyword) ||
                        // Check for acronyms
                        (keyword.length <= 5 && keyword === keyword.toUpperCase() && 
                         title.split(/\s+/).some(word => word.toUpperCase() === keyword))
                    );
                    
                    if (matchedKeywords.length > 0) {
                        manualMatches.push(title);
                    }
                }
                
                console.log('Manual matches from explicit keywords:', manualMatches);
            }
            
            // Combine both approaches and remove duplicates
            this.relevantTitles = [...new Set([
                ...validTitles.map(t => t.toLowerCase()), 
                ...manualMatches
            ])];
            
            console.log('Combined relevant titles:', this.relevantTitles);
            console.log('Number of valid titles found:', this.relevantTitles.length);

            // If we still have too few titles, use a more aggressive keyword approach
            if (this.relevantTitles.length < 3) {
                console.log('Not enough titles found, using expanded keyword approach...');
                
                // Extract both explicit keywords and key terms from the search description
                const keywordPrompt = `From this search prompt:
"${searchDescription}"

Extract ALL of these:
1. Explicit terms mentioned in parentheses
2. Skills mentioned (technical or soft skills)
3. Role types or positions
4. Business domains or areas
5. Related synonyms and industry terms

Return ONLY a comma-separated list of terms.`;
                
                const keywordCompletion = await openai.completions.create({
                    model: DEFAULT_MODEL,
                    prompt: keywordPrompt,
                    max_tokens: 150,
                    temperature: 0.2
                });
                
                const allKeywords = keywordCompletion.choices[0].text.trim()
                    .split(',')
                    .map(k => k.trim().toLowerCase())
                    .filter(k => k.length > 2);
                
                console.log('Expanded keywords:', allKeywords);
                
                // Score each title based on keyword matches
                const scoredTitles = [];
                const titlesLower = titlesArray.map(t => t.toLowerCase());
                
                for (const title of titlesLower) {
                    let score = 0;
                    const matchedKeywords = [];
                    
                    // Check direct inclusion
                    for (const keyword of allKeywords) {
                        // Boost score for explicit keywords
                        const isExplicit = explicitKeywords.includes(keyword);
                        const keywordBoost = isExplicit ? 2 : 1;
                        
                        // Check if title contains the keyword
                        if (title.includes(keyword)) {
                            score += keywordBoost;
                            matchedKeywords.push(keyword);
                        }
                        
                        // Check if title words contain/match the keyword
                        const titleWords = title.split(/\s+/);
                        for (const word of titleWords) {
                            if (word.length > 2 && (word.includes(keyword) || keyword.includes(word))) {
                                score += keywordBoost * 0.5; // Partial match gets half points
                                matchedKeywords.push(`${word}~${keyword}`);
                            }
                        }
                    }
                    
                    if (score > 0) {
                        scoredTitles.push({ 
                            title, 
                            score,
                            matches: [...new Set(matchedKeywords)]
                        });
                    }
                }
                
                // Sort by score and take top matches
                const topScoredMatches = scoredTitles
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 15);
                    
                console.log('Top scored matches:', 
                    topScoredMatches.map(m => `${m.title} (${m.score}): ${m.matches.join(', ')}`));
                
                const additionalTitles = topScoredMatches.map(item => item.title);
                
                // Combine with existing titles
                this.relevantTitles = [...new Set([...this.relevantTitles, ...additionalTitles])];
                console.log('Final combined titles:', this.relevantTitles);
            }
        } catch (error) {
            console.error('Error filtering titles:', error);
            
            // Fallback to direct keyword matching if AI fails
            if (explicitKeywords.length > 0 && this.relevantTitles.length === 0) {
                console.log('Using fallback keyword matching with explicit keywords');
                
                this.relevantTitles = titlesArray
                    .filter(title => {
                        const titleLower = title.toLowerCase();
                        return explicitKeywords.some(keyword => titleLower.includes(keyword.toLowerCase()));
                    })
                    .map(t => t.toLowerCase());
                    
                console.log('Fallback titles:', this.relevantTitles);
            }
        }
    }

    async initializeTitles(searchDescription, people) {
        // First analyze titles from the CSV
        await this.analyzeTitlesFromCSV(people);
        // Then filter them based on the search description
        await this.filterTitlesByRelevance(searchDescription);
    }

    filterByTitle(person) {
        if (!person.title) return false;
        const personTitle = person.title.toLowerCase();
        
        // Enhanced matching logic with specific handling for explicit keywords
        for (const relevantTitle of this.relevantTitles) {
            // Exact match
            if (personTitle === relevantTitle) {
                console.log(`Exact title match: "${person.title}" for ${person.name}`);
                return true;
            }
            
            // Significant partial match (containment in either direction)
            if (personTitle.includes(relevantTitle) || relevantTitle.includes(personTitle)) {
                console.log(`Partial title match: "${person.title}" with "${relevantTitle}" for ${person.name}`);
                return true;
            }
            
            // Word-level matching (for multi-word titles)
            const personTitleWords = personTitle.split(/\s+/).filter(w => w.length > 2);
            const relevantTitleWords = relevantTitle.split(/\s+/).filter(w => w.length > 2);
            
            // Check if there's significant word overlap
            const matchingWords = personTitleWords.filter(word => 
                relevantTitleWords.some(rWord => rWord.includes(word) || word.includes(rWord))
            );
            
            if (matchingWords.length >= Math.min(2, Math.ceil(relevantTitleWords.length/2))) {
                console.log(`Word-level title match: "${person.title}" with "${relevantTitle}" for ${person.name}`);
                console.log(`Matching words: ${matchingWords.join(', ')}`);
                return true;
            }
        }
        
        console.log(`No title match: "${person.title}" for ${person.name}`);
        return false;
    }
}

// Agent 2: Semantic Search Agent
class SemanticSearchAgent {
    async ratePerson(person, searchDescription) {
        const prompt = `Rate how well this person matches the following description (0-100):
        Person: ${person.name}, Title: ${person.title}, Experience: ${person.experience}
        Search Description: ${searchDescription}
        Provide only a number between 0-100.`;

        try {
            const completion = await openai.completions.create({
                model: "gpt-3.5-turbo",
                prompt: prompt,
                max_tokens: 5,
                temperature: 0.1
            });

            const rating = parseInt(completion.choices[0].text.trim());
            return isNaN(rating) ? 0 : rating;
        } catch (error) {
            console.error('Error in semantic search:', error);
            return 0;
        }
    }
}

// Agent 3: AI Match Verification
class AIMatchVerificationAgent {
    async verifyMatch(person, searchDescription) {
        const prompt = `Verify if this person is a good match for the following description:
        Person: ${person.name}, Title: ${person.title}, Experience: ${person.experience}
        Search Description: ${searchDescription}
        Respond with either "MATCH" or "NO_MATCH" only.`;

        try {
            const completion = await openai.completions.create({
                model: DEFAULT_MODEL,
                prompt: prompt,
                max_tokens: 10,
                temperature: 0.1
            });

            return completion.choices[0].text.trim() === "MATCH";
        } catch (error) {
            console.error('Error in AI verification:', error);
            return false;
        }
    }
}

// Main search function
async function searchPeople(inputFile, searchDescription, outputFile) {
    const titleAgent = new TitleFilterAgent();
    const semanticAgent = new SemanticSearchAgent();
    const verificationAgent = new AIMatchVerificationAgent();

    const people = [];

    // Read input CSV
    await new Promise((resolve, reject) => {
        fs.createReadStream(inputFile)
            .pipe(csv.parse({ columns: true, skip_empty_lines: true }))
            .on('data', (data) => people.push(data))
            .on('end', resolve)
            .on('error', reject);
    });

    console.log(`Processing ${people.length} people...`);

    // Initialize the title agent with the search description and people data
    await titleAgent.initializeTitles(searchDescription, people);

    const results = [];

    // Process each person through the agents
    for (const person of people) {
        // Agent 1: Title filtering
        if (!titleAgent.filterByTitle(person)) {
            continue;
        }

        // // Agent 2: Semantic search
        // const rating = await semanticAgent.ratePerson(person, searchDescription);
        // if (rating < 50) { // Adjust threshold as needed
        //     continue;
        // }

        // // Agent 3: AI verification
        // const isMatch = await verificationAgent.verifyMatch(person, searchDescription);
        // if (isMatch) {
            results.push({
                ...person,
                // match_rating: rating
            });
        // }
    }

    // Write results to CSV
    const csvWriter = createObjectCsvWriter({
        path: outputFile,
        header: [
            { id: 'name', title: 'Name' },
            { id: 'title', title: 'Title' },
            { id: 'experience', title: 'Experience' },
            { id: 'match_rating', title: 'Match Rating' }
        ]
    });

    await csvWriter.writeRecords(results);
    console.log(`Search complete. Found ${results.length} matches. Results saved to ${outputFile}`);
}

// Example usage
const inputFile = process.argv[2] || 'input.csv';
const searchDescription = process.argv[3] || 'Looking for a person responsible for conversion optimization, (CRO, Conversion Optimization, UX, Digital Conversion, Marketing, Product) and join to team recently (up 6 month)';
const outputFile = process.argv[4] || 'output.csv';

searchPeople(inputFile, searchDescription, outputFile).catch(console.error); 