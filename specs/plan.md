# Playwright Test Plan — Senthil Palanivelu Personal Website

**Target URL:** https://senthilcaesar.github.io/
**Scope:** Entry page only. No navigation to sub-pages or external URLs.
**Date:** 2026-06-01
**Total Scenarios:** 40 (5 groups × 8 scenarios)

---

## Application Overview

The entry page is a single-page personal portfolio site for Senthil Palanivelu. It is composed of three content sections rendered directly on load:

| Section         | Key Elements                                                                          |
| --------------- | ------------------------------------------------------------------------------------- |
| **Hero**        | Profile photo, greeting with animated wave emoji, name, two bio paragraphs            |
| **Quick Links** | H2 heading + CSS-grid list of 9 labelled links (all open `_blank`)                    |
| **Contact**     | H2 heading + name/email block + three social icon links (LinkedIn, GitHub, Instagram) |

A single **Dark Mode toggle button** (`#theme-toggle`) floats above the sections and persists the user's preference in `localStorage` under the key `theme`.

---

## Page Inventory

### Interactive Elements

| Element              | Selector / Role                                           | Description                                                             |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Theme toggle button  | `#theme-toggle` / `button[aria-label="Toggle Dark Mode"]` | Switches light↔dark; stores in `localStorage.theme`                     |
| Portfolio link       | `a` with text "Portfolio"                                 | Opens `https://senthilcaesar.github.io/portfolio/` in new tab           |
| Readings link        | `a` with text "Readings"                                  | Opens `https://senthilcaesar.github.io/my-reading/` in new tab          |
| KnowledgeLab link    | `a` with text "KnowledgeLab"                              | Opens `https://senthilcaesar.github.io/knowledgelab/` in new tab        |
| URL Library link     | `a` with text "URL Library"                               | Opens `https://senthilcaesar.github.io/resources/` in new tab           |
| Blogs link           | `a` with text "Blogs"                                     | Opens `https://senthilcaesar.github.io/blogs/` in new tab               |
| Commands link        | `a` with text "Commands"                                  | Opens `https://senthilcaesar.github.io/commands/` in new tab            |
| Prompt Shelf link    | `a` with text "Prompt Shelf"                              | Opens `https://senthilcaesar.github.io/promptshelf/` in new tab         |
| Notebook link        | `a` with text "Notebook"                                  | Opens `https://senthilcaesar.github.io/notebook/` in new tab            |
| Content Tracker link | `a` with text "Content Tracker"                           | Opens `https://senthilcaesar.github.io/url-content-tracker/` in new tab |
| LinkedIn icon link   | `a[href*="linkedin"]`                                     | Opens LinkedIn profile in new tab                                       |
| GitHub icon link     | `a[href*="github.com"]`                                   | Opens GitHub profile in new tab                                         |
| Instagram icon link  | `a[href*="instagram"]`                                    | Opens Instagram profile in new tab                                      |

### Static Content

| Element                    | Observed Value                                          |
| -------------------------- | ------------------------------------------------------- |
| `document.title`           | `Senthil Palanivelu`                                    |
| `meta[name="description"]` | `Senthil Palanivelu's personal website`                 |
| `meta[name="viewport"]`    | `width=device-width, initial-scale=1.0`                 |
| Favicon                    | `https://senthilcaesar.github.io/images/sp.png`         |
| Profile image `alt`        | `Senthil Palanivelu`                                    |
| H2 headings                | `Quick Links`, `Contact`                                |
| Wave emoji class           | `.wave` (CSS animation: `2.5s infinite wave-animation`) |
| Light mode body background | `rgb(241, 233, 210)`                                    |
| Dark mode body background  | `rgb(48, 52, 70)`                                       |
| Dark mode body class       | `dark-mode`                                             |

---

## Assumptions (All Scenarios)

- **Starting state:** Fresh browser context, no prior `localStorage` values, light mode is the default.
- **Viewport default:** 1280 × 800 desktop unless explicitly specified otherwise.
- **No navigation:** Tests assert properties and interactions on `https://senthilcaesar.github.io/` only; no link is followed to completion.
- **JavaScript enabled.**
- **Network is available** (GitHub Pages CDN accessible).

---

## Group 1 — Page Load & Metadata (8 Scenarios)

### TC-01-01 · Page loads with correct document title

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Wait for the page to reach `DOMContentLoaded` state.
3. Read `document.title`.

**Expected result:** `document.title` equals `"Senthil Palanivelu"`.

---

### TC-01-02 · Meta description is present and correct

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('meta[name="description"]')`.
3. Read the element's `content` attribute.

**Expected result:** The `content` attribute equals `"Senthil Palanivelu's personal website"`.

---

### TC-01-03 · Viewport meta tag enables responsive design

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('meta[name="viewport"]')`.
3. Read the element's `content` attribute.

**Expected result:** The `content` attribute equals `"width=device-width, initial-scale=1.0"`.

---

### TC-01-04 · Favicon is declared and accessible

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('link[rel="icon"]')`.
3. Read the element's `href` attribute.

**Expected result:** `href` equals `"https://senthilcaesar.github.io/images/sp.png"` (or resolves to that absolute URL).

---

### TC-01-05 · All three main sections are present in the DOM

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Assert that `document.querySelector('.hero-section')` exists.
3. Assert that `document.querySelector('.quick-links-section')` exists.
4. Assert that `document.querySelector('.contact-section')` exists.

**Expected result:** All three elements are non-null.

---

### TC-01-06 · Page has exactly two H2 headings with correct text

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelectorAll('h2')`.
3. Collect `textContent` of each.

**Expected result:**

- Exactly 2 `<h2>` elements exist.
- First heading reads `"Quick Links"`.
- Second heading reads `"Contact"`.

---

### TC-01-07 · No JavaScript console errors on initial load

**Priority:** High

**Steps:**

1. Open a fresh browser context with console monitoring enabled.
2. Navigate to `https://senthilcaesar.github.io/`.
3. Wait until `networkidle`.
4. Collect all `console.error` and uncaught exception messages.

**Expected result:** Zero console errors and zero uncaught exceptions are recorded.

---

### TC-01-08 · Default theme on first visit is light mode (no prior localStorage)

**Priority:** Critical

**Steps:**

1. Open a fresh browser context with `localStorage` cleared.
2. Navigate to `https://senthilcaesar.github.io/`.
3. Read `localStorage.getItem('theme')`.
4. Read `document.body.className`.
5. Confirm the theme toggle button shows ☀️.

**Expected result:**

- `localStorage.theme` is either `null` or `"light"`.
- `document.body.className` does **not** contain `"dark-mode"`.
- Toggle button text content is `"☀️"`.

---

## Group 2 — Hero Section: Profile & Biography (8 Scenarios)

### TC-02-01 · Profile image is visible with correct alt text

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('.hero-section img')`.
3. Read the `alt` attribute.
4. Assert the element is visible (not hidden by CSS).

**Expected result:** `alt` equals `"Senthil Palanivelu"` and the image is visible in the viewport.

---

### TC-02-02 · Profile image loads successfully (not broken)

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Wait for the network to be idle.
3. Query `document.querySelector('.hero-section img')`.
4. Read `naturalWidth` and `complete` properties.

**Expected result:** `complete` is `true` and `naturalWidth` is greater than `0`.

---

### TC-02-03 · Greeting text "Hi" is visible

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Assert that the first paragraph in `.hero-section` contains the text `"Hi"`.

**Expected result:** The greeting paragraph is visible and contains `"Hi"`.

---

### TC-02-04 · Wave emoji 👋 is present in the greeting

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('.wave')`.
3. Read `textContent`.
4. Read the `title` attribute.

**Expected result:** `textContent` contains `"👋"` and `title` equals `"Hello!"`.

---

### TC-02-05 · Wave animation is applied to the 👋 emoji

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query the `.wave` element.
3. Call `window.getComputedStyle(el).animation`.

**Expected result:** The computed animation string contains `"wave-animation"` and indicates an infinite duration (contains `"infinite"`).

---

### TC-02-06 · Full name "Senthil Palanivelu" appears in the bio paragraph

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Read the first paragraph of `.hero-section`.
3. Assert the paragraph contains `"Senthil Palanivelu"`.

**Expected result:** The text `"Senthil Palanivelu"` is present in the bio paragraph.

---

### TC-02-07 · Second bio paragraph contains key professional keywords

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Read the second paragraph inside `.hero-section`.
3. Assert its text includes `"Data Analytics"`.
4. Assert its text includes `"AI Engineering"`.
5. Assert its text includes `"Machine Learning"`.

**Expected result:** All three keywords are present in the paragraph text.

---

### TC-02-08 · Hero section is visible and non-collapsed at mobile viewport (375 × 812)

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Set viewport to `375 × 812`.
3. Get the bounding rect of `.hero-section`.
4. Assert height is greater than `0`.
5. Assert the profile image is still visible.

**Expected result:** `.hero-section` has a positive height and the profile image is visible without overflow clipping at 375 px width.

---

## Group 3 — Dark Mode Toggle (8 Scenarios)

### TC-03-01 · Toggle button is visible and shows ☀️ icon in default light mode

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/` (fresh state, no localStorage).
2. Query `document.getElementById('theme-toggle')`.
3. Assert it is visible.
4. Read `textContent` of the button.

**Expected result:** Button is visible and its `textContent` equals `"☀️"`.

---

### TC-03-02 · Toggle button has accessible aria-label

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.getElementById('theme-toggle')`.
3. Read `getAttribute('aria-label')`.

**Expected result:** `aria-label` equals `"Toggle Dark Mode"`.

---

### TC-03-03 · Clicking the toggle button once activates dark mode

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/` (fresh, no localStorage).
2. Confirm `document.body.className` does not contain `"dark-mode"`.
3. Click `#theme-toggle`.
4. Read `document.body.className`.

**Expected result:** `document.body.className` contains `"dark-mode"`.

---

### TC-03-04 · Toggle button icon changes to 🌙 after switching to dark mode

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Click `#theme-toggle`.
3. Read `document.getElementById('theme-toggle').textContent`.

**Expected result:** Button `textContent` equals `"🌙"`.

---

### TC-03-05 · Dark mode preference is persisted to localStorage

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/` (fresh, no localStorage).
2. Click `#theme-toggle`.
3. Read `localStorage.getItem('theme')`.

**Expected result:** `localStorage.getItem('theme')` equals `"dark"`.

---

### TC-03-06 · Clicking the toggle a second time reverts to light mode

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Click `#theme-toggle` to enter dark mode.
3. Click `#theme-toggle` again to revert.
4. Read `document.body.className`.
5. Read the button's `textContent`.
6. Read `localStorage.getItem('theme')`.

**Expected result:**

- `document.body.className` does **not** contain `"dark-mode"`.
- Button `textContent` equals `"☀️"`.
- `localStorage.getItem('theme')` equals `"light"`.

---

### TC-03-07 · Dark mode persists across page reload when stored in localStorage

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Set `localStorage.setItem('theme', 'dark')` directly.
3. Reload the page (`location.reload()`).
4. After load, read `document.body.className`.
5. Read the toggle button `textContent`.

**Expected result:**

- `document.body.className` contains `"dark-mode"`.
- Toggle button shows `"🌙"`.

---

### TC-03-08 · Dark mode changes body background and text colour

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Record `window.getComputedStyle(document.body).backgroundColor` as `lightBg`.
3. Click `#theme-toggle` to switch to dark mode.
4. Record `window.getComputedStyle(document.body).backgroundColor` as `darkBg`.
5. Compare the two values.

**Expected result:**

- `lightBg` equals `"rgb(241, 233, 210)"`.
- `darkBg` equals `"rgb(48, 52, 70)"`.
- The two values differ from each other.

---

## Group 4 — Quick Links Section (8 Scenarios)

### TC-04-01 · "Quick Links" heading is visible

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query the H2 element with text `"Quick Links"`.
3. Assert it is visible.

**Expected result:** The `"Quick Links"` H2 heading is rendered and visible.

---

### TC-04-02 · All 9 quick links are present in the list

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelectorAll('.quick-links-section a')`.
3. Count the results.
4. Collect `textContent` of each anchor.

**Expected result:**

- Exactly 9 `<a>` elements exist inside `.quick-links-section`.
- Their text labels (trimmed) are: `"💼Portfolio"`, `"📖Readings"`, `"🧠KnowledgeLab"`, `"🔗URL Library"`, `"✍️Blogs"`, `"💻Commands"`, `"🗄️Prompt Shelf"`, `"📓Notebook"`, `"📡Content Tracker"`.

---

### TC-04-03 · All quick links have `target="_blank"` to open in a new tab

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query all `a` elements inside `.quick-links-section`.
3. For each anchor, read the `target` attribute.

**Expected result:** Every quick link has `target="_blank"`.

---

### TC-04-04 · Portfolio link has the correct destination URL

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query the anchor whose text content contains `"Portfolio"`.
3. Read the `href` attribute.

**Expected result:** `href` equals `"https://senthilcaesar.github.io/portfolio/"`.

---

### TC-04-05 · No quick link has an empty or missing href

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query all `a` elements inside `.quick-links-section`.
3. For each, assert `href` is non-empty and starts with `"https://"`.

**Expected result:** All 9 quick links have well-formed absolute `https://` URLs.

---

### TC-04-06 · Each quick link has an emoji icon span with class "icon"

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. For each anchor in `.quick-links-section`, assert it contains a child `<span class="icon">`.
3. Assert the span's `textContent` is a single emoji character (non-empty).

**Expected result:** All 9 quick links contain an `.icon` span with a non-empty emoji.

---

### TC-04-07 · Quick links grid renders without horizontal overflow on desktop

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/` at viewport `1280 × 800`.
2. Get `window.getComputedStyle(document.querySelector('.quick-links-section ul')).display`.
3. Get the bounding rect of `.quick-links-section`.
4. Assert `rect.right` is less than or equal to `window.innerWidth`.

**Expected result:**

- The list uses `display: grid`.
- The section's right edge does not extend beyond the viewport width.

---

### TC-04-08 · Quick links section is rendered and visible at mobile viewport (375 × 812)

**Priority:** Medium

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Set viewport to `375 × 812`.
3. Query `.quick-links-section`.
4. Assert it is visible with height greater than `0`.
5. Assert all 9 link elements are present.

**Expected result:** The section is visible and all 9 links remain in the DOM at mobile width.

---

## Group 5 — Contact Section (8 Scenarios)

### TC-05-01 · "Contact" heading is visible

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query the H2 element with text `"Contact"`.
3. Assert it is visible.

**Expected result:** The `"Contact"` H2 heading is rendered and visible.

---

### TC-05-02 · Contact section displays the owner's full name

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `.contact-section`.
3. Assert its text content contains `"Senthil Palanivelu"`.

**Expected result:** The string `"Senthil Palanivelu"` is present inside `.contact-section`.

---

### TC-05-03 · Contact section displays the email address

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `.contact-section`.
3. Assert its text content contains `"senthilcaesar@gmail.com"`.

**Expected result:** The email `"senthilcaesar@gmail.com"` is visible in the contact section.

---

### TC-05-04 · LinkedIn social link points to the correct URL

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('a[href*="linkedin"]')`.
3. Read the `href` attribute.

**Expected result:** `href` equals `"https://www.linkedin.com/in/senthil-palanivelu-0ba38844/"`.

---

### TC-05-05 · GitHub social link points to the correct URL

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('a[href*="github.com"]')`.
3. Read the `href` attribute.

**Expected result:** `href` equals `"https://github.com/SenthilCaesar"`.

---

### TC-05-06 · Instagram social link points to the correct URL

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query `document.querySelector('a[href*="instagram"]')`.
3. Read the `href` attribute.

**Expected result:** `href` equals `"https://www.instagram.com/senthil_p89"`.

---

### TC-05-07 · All three social links open in a new tab

**Priority:** High

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Query all `a` elements inside `.contact-section`.
3. For each, read the `target` attribute.

**Expected result:** All three social links (LinkedIn, GitHub, Instagram) have `target="_blank"`.

---

### TC-05-08 · All three social icon links are present in the DOM

**Priority:** Critical

**Steps:**

1. Navigate to `https://senthilcaesar.github.io/`.
2. Assert `document.querySelector('a[href*="linkedin"]')` is non-null.
3. Assert `document.querySelector('a[href*="github.com"]')` is non-null.
4. Assert `document.querySelector('a[href*="instagram"]')` is non-null.

**Expected result:** All three social media anchor elements exist in the DOM.

---

## Scenario Summary Table

| ID       | Group                | Title                                                   | Priority |
| -------- | -------------------- | ------------------------------------------------------- | -------- |
| TC-01-01 | Page Load & Metadata | Page loads with correct document title                  | Critical |
| TC-01-02 | Page Load & Metadata | Meta description is present and correct                 | High     |
| TC-01-03 | Page Load & Metadata | Viewport meta tag enables responsive design             | High     |
| TC-01-04 | Page Load & Metadata | Favicon is declared and accessible                      | Medium   |
| TC-01-05 | Page Load & Metadata | All three main sections are present in the DOM          | Critical |
| TC-01-06 | Page Load & Metadata | Page has exactly two H2 headings with correct text      | High     |
| TC-01-07 | Page Load & Metadata | No JavaScript console errors on initial load            | High     |
| TC-01-08 | Page Load & Metadata | Default theme on first visit is light mode              | Critical |
| TC-02-01 | Hero Section         | Profile image is visible with correct alt text          | Critical |
| TC-02-02 | Hero Section         | Profile image loads successfully (not broken)           | High     |
| TC-02-03 | Hero Section         | Greeting text "Hi" is visible                           | High     |
| TC-02-04 | Hero Section         | Wave emoji 👋 is present in the greeting                | Medium   |
| TC-02-05 | Hero Section         | Wave animation is applied to the 👋 emoji               | Medium   |
| TC-02-06 | Hero Section         | Full name "Senthil Palanivelu" appears in the bio       | High     |
| TC-02-07 | Hero Section         | Second bio paragraph contains key professional keywords | Medium   |
| TC-02-08 | Hero Section         | Hero section is visible at mobile viewport (375×812)    | Medium   |
| TC-03-01 | Dark Mode Toggle     | Button visible and shows ☀️ in default light mode       | Critical |
| TC-03-02 | Dark Mode Toggle     | Toggle button has accessible aria-label                 | High     |
| TC-03-03 | Dark Mode Toggle     | Clicking toggle once activates dark mode                | Critical |
| TC-03-04 | Dark Mode Toggle     | Button icon changes to 🌙 in dark mode                  | High     |
| TC-03-05 | Dark Mode Toggle     | Dark mode preference persisted to localStorage          | Critical |
| TC-03-06 | Dark Mode Toggle     | Clicking toggle again reverts to light mode             | Critical |
| TC-03-07 | Dark Mode Toggle     | Dark mode persists across page reload                   | High     |
| TC-03-08 | Dark Mode Toggle     | Dark mode changes body background and text colour       | Medium   |
| TC-04-01 | Quick Links          | "Quick Links" heading is visible                        | High     |
| TC-04-02 | Quick Links          | All 9 quick links are present in the list               | Critical |
| TC-04-03 | Quick Links          | All quick links have target="\_blank"                   | High     |
| TC-04-04 | Quick Links          | Portfolio link has the correct destination URL          | High     |
| TC-04-05 | Quick Links          | No quick link has an empty or missing href              | High     |
| TC-04-06 | Quick Links          | Each quick link has an emoji icon span                  | Medium   |
| TC-04-07 | Quick Links          | Quick links grid renders without overflow on desktop    | Medium   |
| TC-04-08 | Quick Links          | Quick links visible at mobile viewport (375×812)        | Medium   |
| TC-05-01 | Contact Section      | "Contact" heading is visible                            | High     |
| TC-05-02 | Contact Section      | Contact section displays owner's full name              | High     |
| TC-05-03 | Contact Section      | Contact section displays the email address              | High     |
| TC-05-04 | Contact Section      | LinkedIn link points to correct URL                     | High     |
| TC-05-05 | Contact Section      | GitHub link points to correct URL                       | High     |
| TC-05-06 | Contact Section      | Instagram link points to correct URL                    | High     |
| TC-05-07 | Contact Section      | All three social links open in a new tab                | High     |
| TC-05-08 | Contact Section      | All three social icon links are present in the DOM      | Critical |

---

## Suggested Seed Files

| Test File                          | Covers              |
| ---------------------------------- | ------------------- |
| `tests/page-load/metadata.spec.ts` | TC-01-01 → TC-01-08 |
| `tests/hero/profile-bio.spec.ts`   | TC-02-01 → TC-02-08 |
| `tests/dark-mode/toggle.spec.ts`   | TC-03-01 → TC-03-08 |
| `tests/quick-links/links.spec.ts`  | TC-04-01 → TC-04-08 |
| `tests/contact/social.spec.ts`     | TC-05-01 → TC-05-08 |

---

## Known Observations & Potential Issues

| #   | Observation                                                                                                                                           | Severity |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | All `target="_blank"` links (quick links + social links) lack `rel="noopener noreferrer"`, which is a security risk (tab-napping).                    | Medium   |
| 2   | The theme toggle button does not set `aria-pressed` to reflect the current pressed state, reducing accessibility for screen-reader users.             | Medium   |
| 3   | The email address `senthilcaesar@gmail.com` is displayed as plain text; it is **not** a `mailto:` hyperlink, so users cannot click to compose.        | Low      |
| 4   | Social icon links (LinkedIn, GitHub, Instagram) contain only SVG with no `alt` attribute or `aria-label`, making them inaccessible to screen readers. | Medium   |
| 5   | No `<h1>` heading exists on the page; semantic structure jumps directly to `<h2>`.                                                                    | Low      |
