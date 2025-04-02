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
        this.positiveKeywords = [];
        this.negativeKeywords = [];
        this.allTitles = new Set();
    }

    async extractPositiveKeywords(searchDescription) {
        const prompt = `Based on this job search description:
"${searchDescription}"

Generate a list of job titles, keywords, or terms that should be INCLUDED in the search results.
These are titles or terms that would indicate someone is SUITABLE for this role.

Please use common job titles keywords that would help us find a good match within a list of people depending on their job title and job description.

Return ONLY a comma-separated list of terms, with NO other text.
Each term should be a single word.`;

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

module.exports = TitleFilterAgent; 