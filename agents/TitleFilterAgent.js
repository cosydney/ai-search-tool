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
        // Add structured keyword categorization
        this.keywordsStructure = {
            roles: [],
            seniority: {
                include: [],
                exclude: []
            },
            skills: [],
            exactTitles: {
                include: [],
                exclude: []
            }
        };
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
            const completion = await openai.chat.completions.create({
                model: DEFAULT_MODEL,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.2
            });

            const rawResponse = completion.choices[0].message.content.trim();
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
        
        // Keep backwards compatibility
        this.positiveKeywords = keywordsResult.positiveKeywords;
        this.negativeKeywords = providedNegativeKeywords.length > 0 
            ? providedNegativeKeywords.map(k => k.toLowerCase())
            : keywordsResult.negativeKeywords;
        
        // Set up structured keyword categories
        if (keywordsResult.rawResponse) {
            const response = keywordsResult.rawResponse;
            
            this.keywordsStructure = {
                roles: [
                    ...(response.positiveKeywords?.roleTypes || []).map(k => k.toLowerCase()),
                ],
                seniority: {
                    include: (response.seniorityLevels?.include || []).map(k => k.toLowerCase()),
                    exclude: (response.seniorityLevels?.exclude || []).map(k => k.toLowerCase())
                },
                skills: (response.skillKeywords || []).map(k => k.toLowerCase()),
                exactTitles: {
                    include: (response.positiveKeywords?.exactTerms || []).map(k => k.toLowerCase()),
                    exclude: (response.negativeKeywords?.exactTerms || []).map(k => k.toLowerCase())
                },
                partialTerms: {
                    include: (response.positiveKeywords?.partialTerms || []).map(k => k.toLowerCase()),
                    exclude: (response.negativeKeywords?.partialTerms || []).map(k => k.toLowerCase())
                }
            };
            
            console.log('Structured keywords:', JSON.stringify(this.keywordsStructure, null, 2));
        }
    }

    matchTitle(title) {
        if (!title) return false;
        
        const lowerTitle = title.toLowerCase();
        const titleWords = lowerTitle.split(/\s+/);
        
        // Legacy negative keyword checking for backward compatibility
        for (const negativeKeyword of this.negativeKeywords) {
            if (lowerTitle.includes(negativeKeyword)) {
                console.log(`Title excluded by negative keyword: "${title}" contains "${negativeKeyword}"`);
                return false;
            }
        }
        
        // Check for explicit exclusions from structured keywords
        if (this.keywordsStructure.exactTitles.exclude.some(term => lowerTitle === term)) {
            console.log(`Title exactly matches excluded title: "${title}"`);
            return false;
        }
        
        if (this.keywordsStructure.partialTerms.exclude.some(term => lowerTitle.includes(term))) {
            console.log(`Title contains excluded term: "${title}" contains "${term}"`);
            return false;
        }
        
        if (this.keywordsStructure.seniority.exclude.some(level => lowerTitle.includes(level))) {
            console.log(`Title contains excluded seniority level: "${title}"`);
            return false;
        }
        
        // Two-layer filtering: first check for role match, then for seniority (if specified)
        
        // 1. Check if the title exactly matches any positive exact title
        if (this.keywordsStructure.exactTitles.include.some(term => lowerTitle === term)) {
            console.log(`Title exactly matches included title: "${title}"`);
            return true;
        }
        
        // 2. Check for role match
        // not in use
        const hasRoleMatch = this.keywordsStructure.roles.length === 0 || 
            this.keywordsStructure.roles.some(role => lowerTitle.includes(role));
        
        // 3. Check for skill match
        const hasSkillMatch = this.keywordsStructure.skills.length === 0 || 
            this.keywordsStructure.skills.some(skill => lowerTitle.includes(skill));
        
        // 4. Check for seniority match (if specified)
        // not in use
        const hasSeniorityMatch = this.keywordsStructure.seniority.include.length === 0 || 
            this.keywordsStructure.seniority.include.some(level => lowerTitle.includes(level));
        
        // 5. Check for partial terms
        const hasPartialTermMatch = this.keywordsStructure.partialTerms.include.length === 0 || 
            this.keywordsStructure.partialTerms.include.some(term => lowerTitle.includes(term));
        
        // Title passes if it matches the skill or partial terms
        const matches = hasSkillMatch || hasPartialTermMatch;
        
        if (matches) {
            console.log(`Title matched by structured criteria: "${title}"`);
            console.log(`  Role match: ${hasSkillMatch}, Term match: ${hasPartialTermMatch}`);
        }
        
        return matches;
    }

    filterByTitle(person) {
        if (!person.title) return false;
        return this.matchTitle(person.title);
    }
}

module.exports = TitleFilterAgent; 