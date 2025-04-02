const OpenAI = require('openai');
require('dotenv').config();

// Initialize AI configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_API_BASE || 'https://api.openai.com/v1',
});

// Default model setting
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

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
3. Prioritize titles containing the explicit terms from the prompt
4. Include related/synonym titles even if they don't contain the exact terms`;

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

module.exports = TitleFilterAgent; 