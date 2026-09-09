import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

if (!OPENAI_API_KEY) {
    console.warn(
        "WARNING: OPENAI_API_KEY is not configured. " +
        "AI searches will fail until it is added to .env."
    );
}

const openai = OPENAI_API_KEY
    ? new OpenAI({
        apiKey: OPENAI_API_KEY
    })
    : null;


/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(express.json({ limit: "50kb" }));


/*
|--------------------------------------------------------------------------
| Serve frontend
|--------------------------------------------------------------------------
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));


/*
|--------------------------------------------------------------------------
| Basic input validation
|--------------------------------------------------------------------------
*/

function cleanString(value, maxLength = 200) {

    if (typeof value !== "string") {
        return "";
    }

    return value
        .trim()
        .slice(0, maxLength);
}


function normalizePhone(phone) {

    return phone
        .replace(/[^\d+]/g, "")
        .replace(/(?!^)\+/g, "");
}


function normalizeUsername(username) {

    return username
        .replace(/^@/, "")
        .trim()
        .slice(0, 100);
}


/*
|--------------------------------------------------------------------------
| Build search target
|--------------------------------------------------------------------------
*/

function buildTarget({
    phone,
    username,
    platform
}) {

    const targets = [];

    if (phone) {

        targets.push({
            type: "phone",
            value: normalizePhone(phone)
        });

    }

    if (username) {

        targets.push({
            type: "username",
            value: normalizeUsername(username),
            platform: platform || "unknown"
        });

    }

    return targets;
}


/*
|--------------------------------------------------------------------------
| AI search
|--------------------------------------------------------------------------
|
| The model is instructed to investigate only publicly accessible
| information and return structured findings.
|
*/

async function performPublicSearch(targets) {

    if (!openai) {
        throw new Error(
            "OPENAI_API_KEY is not configured."
        );
    }


    const targetDescription =
        targets
            .map(target => {

                if (target.type === "phone") {

                    return (
                        `Phone number: ${target.value}`
                    );

                }

                return (
                    `Username: ${target.value}\n` +
                    `Platform: ${target.platform}`
                );

            })
            .join("\n\n");


    const systemPrompt = `
You are a public-source OSINT research assistant.

Your task is to investigate publicly accessible information
related to identifiers supplied by the user.

IMPORTANT RULES:

1. Only use information that is publicly accessible on the web.
2. Do not attempt to access private accounts.
3. Do not attempt to obtain passwords, authentication tokens,
   private messages, leaked credentials, or restricted data.
4. Do not bypass authentication, paywalls, CAPTCHAs, robots,
   access controls, or other technical restrictions.
5. Do not claim that two identities are the same merely because
   they share a username, name, location, or other weak signal.
6. Clearly distinguish direct evidence from inference.
7. Preserve source URLs whenever possible.
8. Treat search snippets as weaker evidence than the actual
   publicly accessible source.
9. Do not invent sources, URLs, people, accounts, or facts.
10. If evidence is insufficient, say so.

For every potentially relevant finding, provide:

- type
- platform
- value
- source
- evidence
- status
- confidence

Confidence must be a number from 0 to 1.

Return ONLY valid JSON matching the requested schema.
`;


    const userPrompt = `
Investigate these public identifiers:

${targetDescription}

Look for publicly accessible references that may be relevant,
such as public profiles, public webpages, public posts,
public directory entries, public business pages, or other
legitimate public references.

Do not attempt to access private information.

Return JSON with this structure:

{
  "summary": "short overall summary",
  "results": [
    {
      "type": "string",
      "platform": "string",
      "value": "string",
      "source": "https://...",
      "evidence": "brief evidence from the public source",
      "status": "confirmed | possible | weak | contradicted",
      "confidence": 0.0
    }
  ],
  "possible_matches": [
    {
      "description": "string",
      "reason": "string",
      "confidence": 0.0
    }
  ],
  "contradictions": [
    {
      "description": "string",
      "source": "https://..."
    }
  ]
}
`;


    const response =
        await openai.responses.create({

            model: OPENAI_MODEL,

            tools: [
                {
                    type: "web_search"
                }
            ],

            input: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ]

        });


    const text =
        response.output_text || "";


    return parseAIResponse(text);
}


/*
|--------------------------------------------------------------------------
| Parse AI JSON safely
|--------------------------------------------------------------------------
*/

function parseAIResponse(text) {

    if (!text) {

        return {
            summary: "No analysis was returned.",
            results: [],
            possible_matches: [],
            contradictions: []
        };

    }


    let cleaned = text.trim();


    /*
     * Remove markdown JSON fences if the model
     * accidentally includes them.
     */

    if (cleaned.startsWith("```")) {

        cleaned =
            cleaned
                .replace(/^```(?:json)?/i, "")
                .replace(/```$/i, "")
                .trim();

    }


    try {

        const parsed =
            JSON.parse(cleaned);


        return {
            summary:
                typeof parsed.summary === "string"
                    ? parsed.summary
                    : "",

            results:
                Array.isArray(parsed.results)
                    ? parsed.results
                    : [],

            possible_matches:
                Array.isArray(parsed.possible_matches)
                    ? parsed.possible_matches
                    : [],

            contradictions:
                Array.isArray(parsed.contradictions)
                    ? parsed.contradictions
                    : []
        };

    } catch (error) {

        console.error(
            "Could not parse AI JSON:",
            error
        );

        /*
         * Fail safely rather than returning invented
         * structured information.
         */

        return {
            summary:
                "The research completed, but the AI response " +
                "could not be converted into structured results.",

            results: [],

            possible_matches: [],

            contradictions: []
        };

    }

}


/*
|--------------------------------------------------------------------------
| Sanitize results before returning them to browser
|--------------------------------------------------------------------------
*/

function sanitizeResults(results) {

    if (!Array.isArray(results)) {
        return [];
    }


    return results
        .slice(0, 100)
        .map(result => {

            return {

                type:
                    cleanString(
                        result?.type,
                        100
                    ),

                platform:
                    cleanString(
                        result?.platform,
                        100
                    ),

                value:
                    cleanString(
                        result?.value,
                        500
                    ),

                source:
                    cleanString(
                        result?.source,
                        2000
                    ),

                evidence:
                    cleanString(
                        result?.evidence,
                        2000
                    ),

                status:
                    cleanString(
                        result?.status,
                        50
                    ),

                confidence:
                    normalizeConfidence(
                        result?.confidence
                    )
            };

        });

}


function normalizeConfidence(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.max(
        0,
        Math.min(
            1,
            number
        )
    );

}


/*
|--------------------------------------------------------------------------
| POST /api/search
|--------------------------------------------------------------------------
*/

app.post(
    "/api/search",
    async (req, res) => {

        try {

            const phone =
                cleanString(
                    req.body?.phone,
                    50
                );

            const username =
                cleanString(
                    req.body?.username,
                    100
                );

            const platform =
                cleanString(
                    req.body?.platform,
                    50
                );


            /*
             * Require at least one identifier.
             */

            if (!phone && !username) {

                return res.status(400).json({

                    error:
                        "Enter a phone number or username."

                });

            }


            /*
             * Normalize.
             */

            const normalizedPhone =
                phone
                    ? normalizePhone(phone)
                    : "";

            const normalizedUsername =
                username
                    ? normalizeUsername(username)
                    : "";


            /*
             * Basic validation.
             */

            if (
                phone &&
                (
                    normalizedPhone.length < 7 ||
                    !/\d/.test(normalizedPhone)
                )
            ) {

                return res.status(400).json({

                    error:
                        "Please enter a valid phone number."

                });

            }


            if (
                username &&
                normalizedUsername.length < 2
            ) {

                return res.status(400).json({

                    error:
                        "Please enter a valid username."

                });

            }


            const targets =
                buildTarget({

                    phone:
                        normalizedPhone,

                    username:
                        normalizedUsername,

                    platform
                });


            console.log(
                `[SEARCH] ${new Date().toISOString()}`
            );

            console.log(
                "[TARGETS]",
                targets
            );


            /*
             * Perform public research.
             */

            const analysis =
                await performPublicSearch(
                    targets
                );


            const safeResults =
                sanitizeResults(
                    analysis.results
                );


            /*
             * Return response expected by frontend.
             */

            return res.json({

                query: {

                    phone:
                        normalizedPhone || null,

                    username:
                        normalizedUsername || null,

                    platform:
                        platform || null
                },

                results:
                    safeResults,

                analysis: {

                    summary:
                        analysis.summary,

                    possible_matches:
                        Array.isArray(
                            analysis.possible_matches
                        )
                            ? analysis.possible_matches
                            : [],

                    contradictions:
                        Array.isArray(
                            analysis.contradictions
                        )
                            ? analysis.contradictions
                            : []
                },

                searched_at:
                    new Date().toISOString()

            });

        } catch (error) {

            console.error(
                "[SEARCH ERROR]",
                error
            );


            return res.status(500).json({

                error:
                    error?.message ||
                    "Public search failed."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            status: "ok",

            ai_configured:
                Boolean(
                    OPENAI_API_KEY
                ),

            model:
                OPENAI_MODEL,

            timestamp:
                new Date().toISOString()

        });

    }
);


/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "===================================="
        );
        console.log(
            "       PUBLIC OSINT SEARCH"
        );
        console.log(
            "===================================="
        );
        console.log(
            `Server: http://localhost:${PORT}`
        );
        console.log(
            `AI model: ${OPENAI_MODEL}`
        );
        console.log(
            `AI configured: ${Boolean(
                OPENAI_API_KEY
            )}`
        );
        console.log(
            "===================================="
        );
        console.log("");

    }
);
