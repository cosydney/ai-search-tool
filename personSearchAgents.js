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
        this.positiveKeywords = [];
        this.negativeKeywords = [];
        this.allTitles = new Set();
    }

    async extractPositiveKeywords(searchDescription) {
        const prompt = `Based on this job search description:
"${searchDescription}"

Generate a list of job titles, keywords, or terms that should be INCLUDED in the search results.
These are titles or terms that would indicate someone is SUITABLE for this role.

Return ONLY a comma-separated list of terms, with NO other text.
Each term should be a single word or phrase.`;

        try {
            const completion = await openai.completions.create({
                model: DEFAULT_MODEL,
                prompt: prompt,
                max_tokens: 150,
                temperature: 0.2
            });

            const rawResponse = completion.choices[0].text.trim();
            const positiveKeywords = rawResponse
                .split(',')
                .map(k => k.trim().toLowerCase())
                .filter(k => k.length > 0);

            console.log('AI generated positive keywords:', positiveKeywords);
            return positiveKeywords;
        } catch (error) {
            console.error('Error generating positive keywords:', error);
            return [];
        }
    }

    async extractNegativeKeywords(searchDescription) {
        const prompt = `Based on this job search description:
"${searchDescription}"

You are an agent responsible for filtering out people who are not a good fit from a prompt / job description.

Your role is to think and generate a list of keywords that should be excluded from position titles.

These should be titles or terms that would indicate someone is NOT suitable for this role.

Return ONLY a comma-separated list of terms, with NO other text.
Each term should be a single word or phrase.`;

        try {
            const completion = await openai.completions.create({
                model: DEFAULT_MODEL,
                prompt: prompt,
                max_tokens: 150,
                temperature: 0.2
            });

            const rawResponse = completion.choices[0].text.trim();
            const negativeKeywords = rawResponse
                .split(',')
                .map(k => k.trim().toLowerCase())
                .filter(k => k.length > 0);

            console.log('AI generated negative keywords:', negativeKeywords);
            return negativeKeywords;
        } catch (error) {
            console.error('Error generating negative keywords:', error);
            return [];
        }
    }

    async extractTitlesFromCSV(people) {
        // Extract all unique titles from the CSV
        people.forEach(person => {
            if (person.title) {
                this.allTitles.add(person.title.toLowerCase());
            }
        });

        console.log(`Found ${this.allTitles.size} unique titles in the CSV`);
    }

    resolveKeywordConflicts() {
        // If any negative keywords appear in positive keywords, remove them from negative
        const conflicts = this.negativeKeywords.filter(
            negKey => this.positiveKeywords.some(posKey => 
                posKey.includes(negKey) || negKey.includes(posKey)
            )
        );
        
        if (conflicts.length > 0) {
            console.log('Found keyword conflicts (positive takes precedence):', conflicts);
            
            // Remove conflicting keywords from negative list
            this.negativeKeywords = this.negativeKeywords.filter(
                negKey => !this.positiveKeywords.some(posKey => 
                    posKey.includes(negKey) || negKey.includes(posKey)
                )
            );
        }
    }

    async initialize(searchDescription, people, providedNegativeKeywords = []) {
        // Extract titles from CSV data
        await this.extractTitlesFromCSV(people);
        
        // Extract positive and negative keywords
        const [positiveKeywords, aiNegativeKeywords] = await Promise.all([
            this.extractPositiveKeywords(searchDescription),
            this.extractNegativeKeywords(searchDescription)
        ]);
        
        // Use provided negative keywords if available, otherwise use AI generated ones
        this.positiveKeywords = positiveKeywords;
        this.negativeKeywords = providedNegativeKeywords.length > 0 
            ? providedNegativeKeywords.map(k => k.toLowerCase())
            : aiNegativeKeywords;
            
        // Resolve any conflicts between positive and negative keywords
        this.resolveKeywordConflicts();
        
        console.log('Final positive keywords:', this.positiveKeywords);
        console.log('Final negative keywords:', this.negativeKeywords);
    }

    matchTitle(title) {
        if (!title) return false;
        
        const lowerTitle = title.toLowerCase();
        const titleWords = lowerTitle.split(/\s+/);
        
        // Check for negative keywords first (exclusion)
        for (const negativeKeyword of this.negativeKeywords) {
            if (lowerTitle.includes(negativeKeyword)) {
                console.log(`Title excluded by negative keyword: "${title}" contains "${negativeKeyword}"`);
                return false;
            }
        }
        
        // Check for positive keywords (inclusion)
        for (const positiveKeyword of this.positiveKeywords) {
            // Exact match
            if (lowerTitle.includes(positiveKeyword)) {
                console.log(`Title matched by positive keyword: "${title}" contains "${positiveKeyword}"`);
                return true;
            }
            
            // Word-by-word partial matching
            const keywordWords = positiveKeyword.split(/\s+/);
            
            // Check if most of the keyword words appear in the title
            // (useful for multi-word keywords)
            const matchCount = keywordWords.filter(kw => 
                titleWords.some(tw => tw.includes(kw) || kw.includes(tw))
            ).length;
            
            if (keywordWords.length > 1 && matchCount >= Math.ceil(keywordWords.length * 0.75)) {
                console.log(`Title matched by partial positive keyword: "${title}" matches parts of "${positiveKeyword}"`);
                return true;
            }
        }
        
        // No match found
        return false;
    }

    filterByTitle(person) {
        if (!person.title) return false;
        return this.matchTitle(person.title);
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
async function searchPeople(inputFile, searchDescription, outputFile = []) {
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
    await titleAgent.initialize(searchDescription, people);

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

    // Create ordered header with specific columns first, then all others
    const orderedHeader = [];
    
    // Add specific columns first if they exist in the data
    const priorityColumns = ['name', 'title', 'match_rating'];
    for (const column of priorityColumns) {
        if (results.length > 0 && column in results[0]) {
            orderedHeader.push({
                id: column,
                title: column.split(/(?=[A-Z])/).join(' ').replace(/^./, str => str.toUpperCase())
            });
        }
    }

    // Add all other columns
    if (results.length > 0) {
        const allKeys = Object.keys(results[0]);
        const remainingKeys = allKeys.filter(key => !priorityColumns.includes(key));
        
        remainingKeys.forEach(key => {
            orderedHeader.push({
                id: key,
                title: key.split(/(?=[A-Z])/).join(' ').replace(/^./, str => str.toUpperCase())
            });
        });
    }

    // Write results to CSV
    const csvWriter = createObjectCsvWriter({
        path: outputFile,
        header: orderedHeader
    });

    await csvWriter.writeRecords(results);
    console.log(`Search complete. Found ${results.length} matches. Results saved to ${outputFile}`);
}

// Example usage
const inputFile = process.argv[2] || 'input.csv';
const searchDescription = process.argv[3] || 'Looking for a person responsible for conversion optimization, (CRO, Conversion Optimization, UX, Digital Conversion, Marketing, Product) and join to team recently (up 6 month)';
const outputFile = process.argv[4] || 'output.csv';``


searchPeople(inputFile, searchDescription, outputFile).catch(console.error); 