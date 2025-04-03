const OpenAI = require('openai');
require('dotenv').config();

// Initialize AI configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.openai.com/v1',
});

// Default model setting
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

class TitleFilterAgent {
    constructor() {
        this.positiveKeywords = [];
        this.negativeKeywords = [];
        this.allTitles = new Set();
    }

    async extractKeywords(searchDescription) {
        const prompt = `Analyze this job search description to identify title-related keywords for filtering candidates:
"${searchDescription}"

Please provide a structured response in the following JSON format:
{
    "positiveKeywords": {
        "exactTerms": ["List of exact job titles that are highly relevant"],
        "partialTerms": ["List of partial terms that should be included in job titles"],
        "roleTypes": ["Types of roles that would be suitable"]
    },
    "negativeKeywords": {
        "exactTerms": ["List of exact job titles that should be excluded"],
        "partialTerms": ["List of partial terms in job titles that indicate unsuitability"],
        "roleTypes": ["Types of roles that would be unsuitable"]
    },
    "skillKeywords": ["Key technical or professional skills to identify in titles"],
    "seniorityLevels": {
        "include": ["Seniority levels to include"],
        "exclude": ["Seniority levels to exclude"]
    }
}

Focus on job title filtering rather than general job descriptions. Provide terms that would help filter a list of people based on their job titles.
Return a valid JSON object and nothing else.`;

        try {
            const completion = await openai.completions.create({
                model: DEFAULT_MODEL,
                prompt: prompt,
                max_tokens: 500,
                temperature: 0.2
            });

            const rawResponse = completion.choices[0].text.trim();
            let parsedResponse;
            
            try {
                parsedResponse = JSON.parse(rawResponse);
            } catch (parseError) {
                console.error('Error parsing JSON response:', parseError);
                console.log('Raw response:', rawResponse);
                // Fallback to simple keyword extraction if JSON parsing fails
                const fallbackPositive = rawResponse.split(/\n|,/)
                    .map(k => k.trim().toLowerCase())
                    .filter(k => k.length > 0 && !k.startsWith('{') && !k.startsWith('}'));
                return {
                    positiveKeywords: fallbackPositive,
                    negativeKeywords: [],
                    rawResponse: null
                };
            }
            
            // Extract flat arrays for compatibility with existing code
            const positiveKeywords = [
                ...(parsedResponse.positiveKeywords?.exactTerms || []),
                ...(parsedResponse.positiveKeywords?.partialTerms || []),
                ...(parsedResponse.positiveKeywords?.roleTypes || []),
                ...(parsedResponse.skillKeywords || []),
                ...(parsedResponse.seniorityLevels?.include || [])
            ].map(k => k.toLowerCase());
            
            const negativeKeywords = [
                ...(parsedResponse.negativeKeywords?.exactTerms || []),
                ...(parsedResponse.negativeKeywords?.partialTerms || []),
                ...(parsedResponse.negativeKeywords?.roleTypes || []),
                ...(parsedResponse.seniorityLevels?.exclude || [])
            ].map(k => k.toLowerCase());

            console.log('AI generated positive keywords:', positiveKeywords);
            console.log('AI generated negative keywords:', negativeKeywords);
            
            return {
                positiveKeywords,
                negativeKeywords,
                rawResponse: parsedResponse // Store the full structured response for potential future use
            };
        } catch (error) {
            console.error('Error generating keywords:', error);
            return {
                positiveKeywords: [],
                negativeKeywords: [],
                rawResponse: null
            };
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

    async initialize(searchDescription, people, providedNegativeKeywords = []) {
        // Extract titles from CSV data
        await this.extractTitlesFromCSV(people);
        
        const keywordsResult = await this.extractKeywords(searchDescription);
        
        // Handle role types as compound keywords
        const roleTypes = keywordsResult.rawResponse?.positiveKeywords?.roleTypes || [];
        const otherKeywords = [
            ...(keywordsResult.rawResponse?.positiveKeywords?.exactTerms || []),
            ...(keywordsResult.rawResponse?.positiveKeywords?.partialTerms || []),
            ...(keywordsResult.rawResponse?.skillKeywords || []),
            ...(keywordsResult.rawResponse?.seniorityLevels?.include || [])
        ];

        // Create compound keywords by combining role types with other keywords
        const compoundKeywords = roleTypes.flatMap(roleType => 
            otherKeywords.map(keyword => `${roleType} ${keyword}`)
        );

        this.positiveKeywords = [
            ...otherKeywords,
            ...compoundKeywords
        ].map(k => k.toLowerCase());

        this.negativeKeywords = providedNegativeKeywords.length > 0 
            ? providedNegativeKeywords.map(k => k.toLowerCase())
            : keywordsResult.negativeKeywords;
        
        console.log('positive keywords:', this.positiveKeywords);
        console.log('negative keywords:', this.negativeKeywords);
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