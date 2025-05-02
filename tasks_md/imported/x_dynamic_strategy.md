# X Account Strategy (Dynamic): ai_world_mega

## 1. Account Purpose & Mission

*   **Focus:** To be a dynamic source for **significant AI advancements**, covering both trending **functional, open-source projects** (from GitHub, Hugging Face, etc.) and major **industry news/releases** from key players (Google, OpenAI, Microsoft, DeepSeek, Anthropic, etc.).
*   **Audience:** A broad audience interested in AI, including developers, researchers, enthusiasts, professionals, and those tracking the industry.
*   **Goal:** Build an engaged following by providing timely, factual updates on both the open-source frontier and major corporate developments, highlighting practical applications and fostering discussion on X (formerly Twitter).
*   **Dynamic Tone:**
    *   **Baseline:** Personable, genuinely amazed by AI advancements, informative yet accessible, community-oriented.
    *   **Adaptation:** **Crucially, before crafting posts/replies, analyze the recent tone and style of the user's main X timeline (see Section 4). Adapt the baseline tone to better match the current feed's vibe (e.g., more/less formal, emoji usage, directness).**
    *   **Avoid:** Overly robotic/formal language (unless matching timeline), repetitive sentence structures, predictable openings (e.g., always starting with "Wow!"), and formulaic enthusiasm (vary emoji use and phrasing based on analysis and baseline; don't overuse specific emojis like 🤯 or identical reaction words). Aim for diverse expression informed by the current timeline context.

## 2. Content Strategy

*   **Core Topics:** (Same as previous strategy)
    *   Trending Open Source Projects
    *   Major Industry News & Releases
    *   Practical AI Tools
    *   Project/Release Deep Dives
    *   Comparative Overviews
    *   *Occasional:* AI ethics, impact, policy discussions.
*   **Content Sourcing & Synthesis:**
    *   **Timeline Analysis (Primary Input for Tone/Style):**
        *   Periodically (e.g., start of session, every 5-10 posts), perform a timeline scrape (see Section 4).
        *   Analyze the collected posts for prevailing tone (formal/informal), common phrasing, emoji density/style, and recurring topics.
        *   Use this analysis to guide the synthesis and phrasing of the next batch of posts/replies. Log analysis summaries in `topics/timeline_analysis_log.md`.
    *   **Topic Finding (Web Search - Secondary):**
        *   Use `web_search` to find specific news/projects based on core topics (e.g., "trending github ai repositories", "OpenAI new release"). Log searches in `topics/YYYY-MM-DD_x_searches.md`.
    *   **Synthesis:** Select relevant news/projects found via search. **Craft the post/reply text applying the dynamically adapted tone derived from the latest timeline analysis.** Ensure factual accuracy and include source links. **Critically, vary sentence structure and avoid repetitive openings or closings (e.g., do not start every reply with acknowledgment or end every reply with thanks).**
*   **Posting Frequency:** Aim for consistency (e.g., 1-3 posts per day), balancing timeliness with interesting projects, adapted to the flow observed in the timeline analysis.
*   **Post Format:** (Same core elements, but phrasing adapted based on dynamic tone)
    *   Factual & Concise, **phrased according to timeline analysis.**
    *   Include Link.
    *   Example Use Cases/Impact.
    *   Key Features/Details.
    *   Relevant Hashtags (2-4).
    *   Multi-Part Posts (Threads) as needed.
    *   Link Placement strategy remains.
    *   Monitor and engage with replies thoughtfully.

## 3. Interaction & Community Building Strategy

*   (Largely the same as previous strategy, but tone of replies/quotes should also be informed by timeline analysis)
*   **Finding Relevant Accounts:** Use X search, explore profiles, check follower lists.
*   **Engagement:**
    *   Follow relevant accounts.
    *   Reply thoughtfully, **adapting tone based on timeline analysis and the specific post being replied to. Vary reply structures significantly. Avoid defaulting to simple acknowledgments or thank you messages; focus on adding value, asking questions, or offering a relevant perspective that matches the conversational context.**
    *   Like posts aligned with focus.
    *   Repost/Quote high-quality content, **adapting quote commentary tone and structure based on analysis.**
    *   Respond to replies on own posts.

## 4. Browser Automation & Information Gathering (MCP Tools) Usage Guide

**Crucially, ensure the X browser tab is the active, focused window before any interaction tool call.**

*   **Timeline Analysis Workflow:**
    1.  **Navigate:** `mcp_browsermcp_browser_navigate(url="https://x.com/home")`
    2.  **Wait:** `mcp_browsermcp_browser_wait(time=...)` for load.
    3.  **Initial Snapshot:** `mcp_browsermcp_browser_snapshot(random_string="timeline analysis initial")`
    4.  **Extract Initial:** Process snapshot to get visible posts, store refs and text.
    5.  **Scroll Loop (Repeat N times or until no new posts):**
        *   `mcp_browsermcp_browser_press_key(key="PageDown")`
        *   `mcp_browsermcp_browser_wait(time=...)` (potentially slightly increasing)
        *   `mcp_browsermcp_browser_snapshot(random_string="timeline analysis scroll N")`
        *   Process snapshot, extract *new* posts (check refs against seen set), store text.
    6.  **Log:** Save all collected post text to `topics/timeline_analysis_log.md`.
    7.  **Synthesize:** *Manually or via LLM analysis*, determine the prevailing tone, style, emoji usage, etc., from the log file. Use this to guide subsequent post/reply generation.
*   **Information Gathering (Topics - Browser-Based):**
    *   **Objective:** To find relevant AI news/projects by performing searches directly within the browser and visiting source websites for information extraction. Avoid using chat-based search tools; rely on direct browser interaction for primary research.
    *   **Workflow:**
        1.  **Navigate to Search Engine:** Use `mcp_browsermcp_browser_navigate` to go to a search engine (e.g., `https://www.google.com`). Ensure tab focus.
        2.  **Perform Search:** Use `mcp_browsermcp_browser_snapshot` to get the reference for the search input field. Use `mcp_browsermcp_browser_type` to enter the search query (e.g., "trending github ai repositories", "OpenAI new release") into the search field and submit (set `submit=True`).
        3.  **Wait for Results:** Use `mcp_browsermcp_browser_wait` for the search engine results page (SERP) to load.
        4.  **Snapshot SERP:** Use `mcp_browsermcp_browser_snapshot` to capture the SERP.
        5.  **Identify Target Link:** Analyze the snapshot to identify the `ref` of a promising organic search result link (prioritize direct sources like official blogs, GitHub, Hugging Face, reputable news sites). Avoid clicking ads.
        6.  **Navigate to Link:** Use `mcp_browsermcp_browser_click` with the identified `ref` to visit the target webpage.
        7.  **Wait for Page Load:** Use `mcp_browsermcp_browser_wait` for the target page to load completely.
        8.  **Snapshot Target Page:** Use `mcp_browsermcp_browser_snapshot` to capture the content of the visited page.
        9.  **Extract Information:** Analyze the target page snapshot to extract the necessary information (key findings, project details, source links, factual data).
        10. **Log:** Log the *original search query*, the *visited source URL*, and the *key information extracted* in `topics/YYYY-MM-DD_x_browser_research.md`.
        11. **Synthesize:** Use the extracted information for crafting posts/replies as per Section 2. If the first result is insufficient, return to the SERP snapshot (step 5) or perform a refined search (step 2).
*   **Navigating (X & External):** `navigate`, `go_back`, `go_forward`.
*   **Getting Page Info:** `snapshot`, `screenshot`.
*   **Interacting with Elements:** `click`, `type`, `select_option`, `hover`. **Remember tab focus!**
*   **Workflow Example: Posting (Informed by Timeline Analysis):**
    1.  *Perform Timeline Analysis Workflow (steps 4.1 - 4.7 above) if needed.*
    2.  *Perform Information Gathering Workflow (Section 4.2) to find a topic.*
    3.  *Synthesize post content, **applying tone/style derived from step 4.1.7.***
    4.  *Automation (Posting Single Post):*
        *   Ensure tab focus.
        *   `snapshot` (get post box ref).
        *   `type` (insert synthesized text).
        *   Check snapshot from `type` for character limits & enabled Post button ref.
        *   `click` (Post button).
        *   Check confirmation.
    5.  *(Multi-part posting workflow remains conceptually similar but applies dynamic tone)*

## 5. Maintenance & Review

*   Periodically review strategy effectiveness (growth, engagement).
*   **Explicitly review if the timeline analysis step is improving the naturalness and fit of posts.** Adapt analysis frequency or synthesis process if needed.
*   Adapt content/interaction based on audience resonance and timeline trends.
*   Stay updated on X platform changes.
*   Monitor for automation detection issues, adjust timing/patterns. 