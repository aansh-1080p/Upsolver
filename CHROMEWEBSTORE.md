# Chrome Web Store Submission Guide — Upsolver

This document is your single source of truth for submitting **Upsolver** to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole). You can copy-paste descriptions, justifications, and disclosures directly into the store submission form.

---

## 1. Store Listing Metadata

### Extension Name
```text
Upsolver — Competitive Programming Intelligence
```

### Short Summary (max 132 chars)
```text
Analyze Codeforces & LeetCode profiles, synthesize adaptive study plans, discover curated problems, and launch 1-click peer duels.
```

### Category
```text
Developer Tools (or Productivity)
```

### Primary Language
```text
English
```

---

## 2. Detailed Store Description (Formatted for Web Store)

```markdown
⚡ Upsolver is the all-in-one Competitive Programming intelligence companion designed to help programmers master algorithmic problem solving, upsolve contest problems efficiently, and accelerate rating growth on Codeforces and LeetCode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 CORE CAPABILITIES & FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 1. DUAL-PLATFORM PERFORMANCE AUDITS
• Instant deep-dive audits across Codeforces and LeetCode.
• Historical rating progression graphs, contest rank tracking, and rating delta overlays.
• Granular topic breakdown highlighting your top algorithmic strengths and weakest blindspots.
• AI-generated tactical review summarizing where to focus next.

🗺️ 2. ADAPTIVE STUDY PLANNER & HITL REVISIONS
• Synthesize structured 2-to-8 week algorithmic roadmaps tailored to your target rating.
• Track subtopic mastery checklists and weekly completion metrics in real time.
• One-click toggle to flag sections for re-attempt later with high-contrast visual cues.
• Human-in-the-Loop refinement: instruct the planner AI to adjust problem difficulty or shift focus topics.

🧩 3. CURATED PROBLEM DISCOVERY ENGINE
• Search curated problems with blended difficulty filters (Easy, Medium, Hard).
• Filter by topic tags (Dynamic Programming, Segment Trees, Graphs, Greedy, Math, Binary Search).
• Direct 1-click problem launch on Codeforces and LeetCode.

👥 4. PEER BENCHMARKING & LIVE CONTEST RADAR
• Track your friends and rivals across dual platforms with hover mastery cards.
• Live contest radar scanning active Codeforces rounds with real-time friend ranks.
• Launch 1-Click Head-to-Head Peer Duels: compare fighter cards, rating trajectories, and receive AI strategic battle breakdowns.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PRIVACY-FIRST & OPEN ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Zero intrusive tracking or ads.
• Profiles and friends are cached locally in your browser storage.
• Fully open-source and customizable.

Take your competitive programming journey to the next level with Upsolver!
```

---

## 3. Permissions Justifications (Required by Chrome Web Store Review)

When prompted for permission justifications in the Developer Dashboard, paste the following exact explanations:

### `storage`
> **Justification:** "Used to locally store user profile handles, cached audit reports, active study plan progress (completed subtopics and re-attempt flags), and friends roster so users don't need to re-enter them on every launch."

### `host_permissions` (`http://localhost:*/*`, `http://127.0.0.1:*/*`, `https://codeforces.com/*`, `https://leetcode.com/*`)
> **Justification:** "Required to communicate with the local Upsolver API server and fetch contest/profile statistics directly from Codeforces and LeetCode endpoints."

### `optional_host_permissions` (`https://*/*`)
> **Justification:** "Allows users to optionally configure and connect the extension to their own self-hosted cloud backend without requiring broad permissions at initial install time."

---

## 4. Privacy & Data Use Disclosures

In the **Privacy practices** tab of the Chrome Developer Dashboard, declare the following:

- **Single Purpose Description:**
  > "Upsolver analyzes public Codeforces and LeetCode user statistics to provide competitive programming practice plans, performance reports, and problem recommendations."
- **Data Collection Checkboxes:**
  - [x] **User Activity / User Data:** Check only if you collect handles. Disclose: *"Public competitive programming handles entered by the user (Codeforces/LeetCode) used solely to fetch public contest ratings and problem statistics."*
  - [ ] **Personally Identifiable Information:** NO
  - [ ] **Financial / Payment Information:** NO
  - [ ] **Authentication / Passwords:** NO
- **Account Requirements:**
  - "Does the extension require an account?" → **No** (Users simply input their public handles).

---

## 5. Privacy Policy Text

> **Note:** Chrome Web Store requires a publicly accessible URL for your privacy policy. You can host this in your GitHub repository (`https://github.com/aansh-1080p/Upsolver/blob/main/PRIVACY.md`) or on GitHub Pages.

```markdown
# Privacy Policy for Upsolver Chrome Extension

Last updated: August 2026

Upsolver ("we", "our", or "the extension") is committed to protecting your privacy.

### 1. Data Collection & Usage
- Upsolver does NOT collect, store, or sell personal identifiable information (PII), email addresses, or passwords.
- The extension only requests public handles (such as Codeforces and LeetCode usernames) entered by the user to query public APIs for competitive programming statistics, contest ratings, and problem submission history.
- All preferences, study plan progress, and friend rosters are stored locally within your browser using `chrome.storage.local`.

### 2. Third-Party Services
- The extension connects to the Upsolver backend server to aggregate public metrics and generate study plans. No telemetry or analytics data is sold or shared with external advertising networks.

### 3. Contact
If you have questions regarding this policy, please file an issue at https://github.com/aansh-1080p/Upsolver.
```

---

## 6. Store Assets Checklist

| Asset | Dimensions | Required | Purpose |
| :--- | :--- | :--- | :--- |
| **Store Icon** | 128 × 128 px | **Yes** | Displayed in Web Store search results and listing header. Located at `extension/icons/icon128.png`. |
| **Screenshot 1** | 1280 × 800 px (or 640 × 400) | **Yes** | Performance Report & Rating Analytics tab. |
| **Screenshot 2** | 1280 × 800 px (or 640 × 400) | **Recommended** | Interactive Study Plan & Re-attempt Tracker tab. |
| **Screenshot 3** | 1280 × 800 px (or 640 × 400) | **Recommended** | Problems Discovery & Curated practice list. |
| **Screenshot 4** | 1280 × 800 px (or 640 × 400) | **Recommended** | Friends Roster & 1-Click Peer Battle Arena. |
| **Marquee Promo Tile** | 440 × 280 px | Optional | Used if featured on the Chrome Web Store homepage. |

---

## 7. Submission Steps (How to Publish)

1. **Register as a Chrome Web Store Developer**:
   - Go to [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).
   - Sign in with your Google account and pay the one-time $5 developer registration fee if you haven't already.
2. **Create New Item**:
   - Click **New Item** in the top right.
   - Upload the distribution ZIP file: `upsolver-extension-v2.0.0.zip`.
3. **Fill Out Store Listing**:
   - Copy-paste the **Extension Name**, **Summary**, and **Description** from Section 1 & 2 above.
   - Upload the **128x128 Icon** (`extension/icons/icon128.png`) and at least 1 screenshot.
4. **Fill Out Privacy Tab**:
   - Paste the single purpose and permission justifications from Section 3 & 4.
   - Provide the Privacy Policy link (`https://github.com/aansh-1080p/Upsolver/blob/main/PRIVACY.md`).
5. **Submit for Review**:
   - Click **Submit for Review**.
   - Review typically takes 24–72 hours. Once approved, Upsolver will be live and downloadable worldwide!
