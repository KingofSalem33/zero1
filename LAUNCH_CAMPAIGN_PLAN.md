# Zero1 — World-Class Launch Campaign Plan

> **Philosophy:** Idea × Infrastructure × Distribution × Switching Cost = Durable Revenue
>
> The idea is already differentiated. What determines success is the surrounding infrastructure you build *before* launch day, the distribution channels you seed *during* beta, and the switching costs you embed so deeply that users never leave.

---

## Table of Contents

1. [Pre-Launch Checklist](#1-pre-launch-checklist)
   - [Infrastructure](#infrastructure)
   - [Distribution](#distribution)
   - [Switching Cost](#switching-cost)
2. [Launch Readiness Timeline](#2-launch-readiness-timeline-weeks--6-to-4)
3. [Metrics & Instrumentation](#3-metrics--instrumentation)

---

## 1. Pre-Launch Checklist

### Infrastructure

#### AUTH & ONBOARDING

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| I-1 | **Implement a 5-step guided onboarding flow** (pick a book, study goal, preferred translation, notification cadence, first AI query) | Product Engineer | React Router wizard component, Supabase `user_profiles` onboarding state column | M | Supabase schema migration | New user completes onboarding in <3 min; completion rate >70% in beta |
| I-2 | **Add Apple OAuth for web** (currently mobile-only) | Engineer | `VITE_ENABLE_APPLE_OAUTH` env flag, Supabase OAuth provider config | S | Apple Developer account, Supabase config | Web sign-in with Apple functional; e2e test passes |
| I-3 | **Implement magic-link email sequence** (Day 0 welcome, Day 2 feature discovery, Day 7 "did you know" tip, Day 14 retention nudge) | Growth / Engineer | Supabase Edge Functions + Resend (or Postmark) transactional email, HTML email templates | M | Email domain SPF/DKIM/DMARC setup, template design | Sequence active; open rate >40%, click rate >10% in beta cohort |
| I-4 | **Self-serve subscription paywall** (Free tier: 20 AI queries/day; Pro: unlimited, priority model access) | Engineer + Product | Stripe Checkout, Supabase `subscriptions` table with RLS, webhook handler in Express API | L | Stripe account, pricing finalized | Users can upgrade in <60 s; Stripe webhook creates/updates subscription row; rate limiter reads tier |
| I-5 | **Account deletion & GDPR data export** | Engineer | Express endpoint `DELETE /api/user`, Supabase cascade deletes, JSON export builder | S | — | Deletion removes all user rows; export produces valid JSON archive within 30 s |
| I-6 | **Password-less session hardening** (refresh token rotation, idle timeout banner) | Engineer | Supabase `autoRefreshToken`, frontend session-expiry middleware already in desktop | S | Auth hardening Phase 0 complete (already done) | Session rotation tested; idle users prompted after 30 min |
| I-7 | **Crash-free rate target ≥99.5% across all platforms** | Engineer | Sentry dashboards (already wired), set alert thresholds | S | Sentry DSNs live on all platforms | Sentry "crash-free sessions" widget ≥99.5% over 7-day rolling window |

#### PAYMENTS & MONETISATION

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| I-8 | **Define & implement pricing tiers** (Free / Pro $9.99/mo / Ministry $29.99/mo for group access) | Founder + Product | Stripe Products + Prices, Supabase `tiers` enum | S | Stripe account | Three tiers visible on pricing page; checkout flow works end-to-end |
| I-9 | **Annual billing option** (20% discount, improves LTV) | Engineer | Stripe annual Price objects, toggle in checkout UI | S | I-8 complete | Annual checkout functional; Stripe webhook correctly maps interval |
| I-10 | **Stripe customer portal** (manage subscription, update card, cancel) | Engineer | Stripe Billing Portal, redirect from Settings page | S | I-8 complete | Users can self-serve cancel/upgrade without emailing support |
| I-11 | **Revenue dashboard (internal)** | Founder | Stripe Dashboard or ChartMogul free tier, Supabase MRR view | S | I-8 complete | MRR, churn, and new subs visible in one view |

#### PERFORMANCE & RELIABILITY

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| I-12 | **Upgrade API hosting from Render free tier to paid** (eliminates cold-start delay) | DevOps | Render Starter plan ($7/mo) or Railway | S | Billing | P50 cold-start latency <200 ms; no sleep-on-idle |
| I-13 | **Implement Redis cache for AI responses** (same query + same user context = cached response) | Engineer | Upstash Redis (serverless, free tier), custom cache key hash | M | I-12 complete | Cache hit rate >30% within 1 week; AI cost per active user drops measurably |
| I-14 | **CDN for static assets** (Vite build artifacts, Bible text JSON, graph data) | DevOps | Cloudflare Pages or Vercel Edge CDN (already likely on Vercel) | S | Vercel project configured | Lighthouse performance score ≥90 on web |
| I-15 | **App Store Submission prep (iOS)** — final screenshots, App Privacy labels, age rating | Mobile Engineer + Designer | Fastlane screenshots, App Store Connect | M | TestFlight build 18+ stable | App Store review submitted; no binary rejections |
| I-16 | **Google Play Store submission** (if not already started) | Mobile Engineer | Google Play Console, Expo EAS Build | M | Android build signing configured | App in Internal Testing track |
| I-17 | **Desktop auto-update signing verified** (code-sign cert, `DESKTOP_AUTO_UPDATE_ENABLED=true`) | Engineer | Windows code-signing cert (already in CI secrets), electron-updater | S | CI secret `CSC_LINK` valid | Auto-update installs silently from GitHub release; verified on clean VM |

#### LEGAL & TRUST

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| I-18 | **Privacy Policy + Terms of Service pages** | Legal / Founder | Termly or Iubenda template, linked from footer + sign-up flow | S | — | Policies live at `/privacy` and `/terms`; GDPR/CCPA compliant |
| I-19 | **Cookie consent banner** (web) | Engineer | `react-cookie-consent` or equivalent; Sentry loaded only after consent for EU users | S | I-18 complete | Banner appears for EU/UK visitors; Sentry only fires on consent |
| I-20 | **SOC2-lite self-assessment** (document data flows, encryption at rest, access control) | Founder | Vanta Starter or manual Google Doc | M | — | One-page data security summary ready for church/ministry procurement |

---

### Distribution

#### SEO & CONTENT ENGINE

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| D-1 | **Launch a programmatic SEO landing page for every Bible book + top study themes** (e.g., `/study/romans-8`, `/study/grace-in-the-new-testament`) | Engineer + Content | Next.js or Vite SSG route generator, KJV text corpus already available, sitemap generator | L | I-14 (CDN), Bible text data | 1,000+ indexed pages; Ahrefs/Google Search Console shows crawl coverage within 2 weeks of launch |
| D-2 | **Target high-intent longtail keywords** ("verse by verse Bible study", "what does Romans 8 mean", "KJV commentary") | SEO / Content | Ahrefs or Semrush keyword research, Google Search Console | S | D-1 | 50-keyword target list mapped to landing pages |
| D-3 | **Blog: 12 "pillar" posts** pre-written before launch (exegesis how-tos, featured AI study sessions, theological deep dives) | Content Writer | Headless CMS (Contentful free tier or MDX in repo), blog at `/blog` | L | I-14, D-1 | 12 posts live, internally linked to product CTAs, indexed |
| D-4 | **YouTube channel: 10 seed videos** (product walkthroughs, "AI explains [passage]" shorts, comparison vs. manual concordance study) | Content Creator | Screen recording + OBS, YouTube Studio, thumbnail templates | L | — | 10 videos published; 3+ shorts optimized for Shorts algorithm |
| D-5 | **Structured data (schema.org) on all scripture pages** (`Article`, `FAQPage`, `HowTo`) | Engineer | JSON-LD in page `<head>`, Google Rich Results tester | S | D-1 | Zero Google Search Console errors on rich result test |

#### COMMUNITY & SOCIAL

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| D-6 | **Build a waitlist / pre-launch email list of 2,000+** | Growth | Mailchimp or ConvertKit embedded form on landing page, Typeform, referral incentive ("refer 3, get 3 months Pro free") | M | Landing page live | 2,000 verified emails collected before launch week |
| D-7 | **Seed 5 Reddit communities** (r/Christianity 3M+, r/Reformed, r/Bible, r/theology, r/AskBibleStudy) with value-first posts (not ads) | Growth | Reddit account with karma, genuine helpfulness posts linking to free tool | S | Product stable, free tier available | 5 threads posted; at least 2 reach >50 upvotes |
| D-8 | **Join and contribute to 10 Facebook Bible study groups** (100K–1M member groups) | Growth / Founder | Facebook Groups, personal account | S | — | Active contributor in 10 groups; moderator relationships established |
| D-9 | **Partner with 3 seminary or Bible college professors** for pilot access + testimonial | BD / Founder | Email outreach, academic pricing tier, co-branded case study | M | I-4 (paywall), Ministry tier | 3 signed testimonials or institutional pilots |
| D-10 | **Church tech coordinator outreach** (email 100 churches with >500 members) | Growth | Apollo.io or Hunter.io for contacts, church website scraper, personalized email sequence | M | I-4 (Ministry tier) | 10% response rate; 5 Ministry pilot conversions |
| D-11 | **Product Hunt launch** (with 50+ upvotes commitment pre-secured from beta users) | Founder + Growth | Product Hunt profile, launch scheduling, Hunter community | S | D-6 (list), product stable | #1 or #2 Product of the Day in "Productivity" or "AI" category |
| D-12 | **Twitter/X "Bible AI" niche presence** (daily verse + AI insight, reply to theology threads) | Growth | Buffer or Hypefury for scheduling, branded thread templates | M | — | 1,000 followers; 3 viral threads (>1,000 impressions each) before launch |
| D-13 | **Newsletter sponsorship in 1–2 Christian tech/ministry newsletters** | Growth | Beehiiv Boosts, paid newsletter ad slots ($200–500/issue) | S | Budget approved | 2 newsletter ads run; UTM-tracked signups from each |
| D-14 | **App Store Optimization (ASO)** — keyword-rich title, subtitle, description for iOS + Android | Mobile Engineer + Growth | AppFollow or Sensor Tower free tier, competitor keyword analysis | S | I-15, I-16 | ASO checklist complete; primary keyword in title/subtitle |
| D-15 | **Podcast outreach** (Christian tech, apologetics, seminary podcasts) | BD / Founder | Rephonic for podcast research, personalized pitch email | M | — | 3 confirmed podcast appearances scheduled around launch week |

#### PRESS & INFLUENCERS

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| D-16 | **Press kit page** (`/press`) with logos, screenshots, founder bio, key stats, product demo video | Designer + Founder | Figma assets, Vimeo/Loom demo, press-kit ZIP download | S | Design assets ready | Press kit page live; media inquiry email configured |
| D-17 | **Outreach to 5 Christian tech/ministry journalists** (Christianity Today, The Gospel Coalition, Relevant Magazine) | Founder | Muck Rack or manual search, personalized 3-paragraph pitch | M | D-16 live | 2+ journalist responses; 1 committed feature story |
| D-18 | **Micro-influencer campaign** (20 Christian YouTubers/TikTokers with 5K–100K subscribers) | Growth | grapevine.io or manual DM, affiliate code per influencer | M | I-4 (paywall + affiliate tracking) | 20 outreach messages; 5 agreed collaborations; 3 videos published by launch week |

---

### Switching Cost

> Switching costs are not locks — they are value accumulation. Every hour a user invests should compound into something they would grieve losing.

| # | Action | Owner | Tools / Assets | Effort | Dependencies | Done Criteria |
|---|--------|-------|----------------|--------|--------------|---------------|
| SC-1 | **Rich annotation system** — inline highlights with color tags, margin notes, linked cross-references, all synced across platforms via Supabase | Engineer | `highlights` table (exists), add `margin_notes` column, cross-ref linking UI | M | Supabase schema | Users can annotate, tag, and link any verse; syncs across web/mobile/desktop in <2 s |
| SC-2 | **Personal study library with custom collections** — user-named collections, reorderable, exportable | Engineer | `library` table (exists), drag-and-drop UI (dnd-kit), export to PDF/JSON | M | Library UI complete | Users can create, name, reorder, and export 3+ collections |
| SC-3 | **Study history & "Your Journey" dashboard** — time-studied heatmap, verses explored, AI conversation history, milestone badges | Engineer + Designer | `verse_analytics` table (exists), Chart.js or Recharts heatmap, Supabase aggregation queries | M | verse_analytics populated | Journey page shows 30-day heatmap; milestone badges awarded at 7, 30, 100 study days |
| SC-4 | **AI memory / personalization** — AI remembers user's theological tradition, study goals, previous discussions, preferred commentary style | Engineer | Supabase `user_context` JSONB column, prompt injection strategy (already versioned in `/prompts`) | M | Prompt architecture (exists) | AI references user's tradition and prior topics in ≥50% of sessions after onboarding |
| SC-5 | **Shareable study cards** — one-click share of AI insight + verse as branded image card for social | Engineer + Designer | HTML Canvas or `html-to-image`, Cloudinary for hosting, branded frame templates | M | Design assets | User can generate + download/share card in <10 s; card includes Zero1 logo + verse ref |
| SC-6 | **Export to popular formats** — PDF study notes, EPUB, CSV of highlights, plain-text Bible commentary | Engineer | `pdfkit` or `puppeteer` PDF generation, `json2csv`, EPUB builder | M | SC-1, SC-2 complete | Export modal offers 4 formats; PDF renders correctly with fonts and verse citations |
| SC-7 | **Cross-device bookmark sync (offline-first)** — bookmarks available offline, sync on reconnect | Mobile Engineer | Expo SQLite for local store, sync queue in `shared` package, conflict resolution (last-write-wins) | L | Mobile Phase 2.5 stable | Bookmarks persist offline on mobile; sync completes on reconnect with zero data loss |
| SC-8 | **"Study streak" gamification** — daily streak counter, streak restore (grace day), achievement system | Engineer + Product | Supabase `study_streaks` table, push notifications (Expo Notifications), in-app achievement modal | M | SC-3, I-3 (email) | Streak visible on home screen; push notification fires at user's preferred study time |
| SC-9 | **Community / small group feature (v1)** — shared study collections a pastor can push to a group | Engineer | Supabase `groups` table, RLS group policies, invite link | L | I-4 (Ministry tier) | Pastor can create group, invite up to 20 members, share a collection; members see shared notes |

---

## 2. Launch Readiness Timeline (Weeks -6 to +4)

```
WEEK -6  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Infrastructure:
  ✦ [I-1]  Onboarding flow shipped to beta
  ✦ [I-8]  Pricing tiers defined & Stripe Products created
  ✦ [I-18] Privacy Policy + ToS pages live
  ✦ [I-20] SOC2-lite data security document drafted
  Distribution:
  ✦ [D-2]  50-keyword SEO target list finalized
  ✦ [D-6]  Waitlist form live on landing page; referral incentive active
  ✦ [D-16] Press kit page drafted
  Switching Cost:
  ✦ [SC-1] Annotation system shipped to beta (highlights + margin notes)
  ✦ [SC-4] AI memory / personalization column + prompt injection live

WEEK -5  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Infrastructure:
  ✦ [I-4]  Stripe paywall integrated (Free/Pro/Ministry tiers)
  ✦ [I-9]  Annual billing option live
  ✦ [I-10] Stripe customer portal wired to Settings
  ✦ [I-12] API hosting upgraded to Render Starter (no cold starts)
  Distribution:
  ✦ [D-3]  First 6 blog pillar posts published
  ✦ [D-12] Twitter/X account created; daily posting begins
  ✦ [D-7]  Begin seeding Reddit communities (value-first, no ads)
  Switching Cost:
  ✦ [SC-2] Custom library collections UI complete
  ✦ [SC-3] Study history / Journey dashboard shipped

WEEK -4  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Infrastructure:
  ✦ [I-13] Redis cache for AI responses live (Upstash)
  ✦ [I-3]  Email onboarding sequence live (Day 0/2/7/14)
  ✦ [I-2]  Apple OAuth for web enabled
  ✦ [I-19] Cookie consent banner live for EU
  Distribution:
  ✦ [D-1]  Programmatic SEO pages generated + submitted to Google
  ✦ [D-4]  First 5 YouTube videos published
  ✦ [D-9]  Seminary professor outreach sent (target 3 partnerships)
  ✦ [D-10] Church coordinator email campaign launched (100 churches)
  ✦ [D-18] Micro-influencer outreach sent (20 targets)
  Switching Cost:
  ✦ [SC-5] Shareable study cards feature shipped
  ✦ [SC-6] Export to PDF/JSON shipped
  ✦ [SC-8] Study streak gamification live

  ★ MILESTONE: Beta → "Soft Launch" access (invite-only, no paywall)

WEEK -3  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Infrastructure:
  ✦ [I-15] iOS App Store submission sent
  ✦ [I-16] Android Google Play submission sent
  ✦ [I-17] Desktop auto-update signing verified
  ✦ [I-5]  GDPR data export + account deletion live
  Distribution:
  ✦ [D-3]  Remaining 6 blog pillar posts published (12 total)
  ✦ [D-13] Newsletter sponsorships booked (2 issues, launch week)
  ✦ [D-15] Podcast appearances confirmed (3+)
  ✦ [D-17] Press outreach sent to 5 journalists
  ✦ [D-8]  Active in 10 Facebook Bible study groups
  Switching Cost:
  ✦ [SC-7] Offline-first bookmark sync shipped to mobile beta
  ✦ Measure: Annotation depth (notes per user), streak retention, export usage

  ★ MILESTONE: Feature freeze; QA regression suite passing on all platforms

WEEK -2  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Infrastructure:
  ✦ [I-7]  Sentry crash-free rate ≥99.5% confirmed
  ✦ [I-14] Lighthouse ≥90 confirmed
  ✦ [I-11] Revenue dashboard live (Stripe + ChartMogul)
  ✦ iOS + Android App Store approvals expected
  Distribution:
  ✦ [D-11] Product Hunt launch page drafted; 50 supporters pre-committed
  ✦ [D-18] Micro-influencer videos being filmed; 3+ confirmed for launch week
  ✦ [D-6]  Waitlist at 2,000+ emails confirmed (or push harder)
  ✦ [D-4]  Remaining 5 YouTube videos published (10 total)
  Switching Cost:
  ✦ [SC-9] Group/small group v1 shipped (Ministry tier)
  ✦ All switching cost features in QA

  ★ MILESTONE: Launch email draft finalized; all distribution assets ready

WEEK -1  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✦ Email blast to waitlist: "We launch in 7 days — here's your early access code"
  ✦ Paywall enabled on all new sign-ups (free tier gated, Pro unlocked for waitlist)
  ✦ Final smoke tests across web, mobile, desktop
  ✦ Support inbox and FAQ page live
  ✦ Runbook for launch day incidents prepared
  ✦ Team on-call schedule for launch week

  ★ MILESTONE: Code frozen; monitoring dashboards green; all hands ready

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ LAUNCH DAY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WEEK 0  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Monday:  Email blast to full list; paywall live
  Tuesday: Product Hunt launch (9am ET)
  Wednesday: Newsletter sponsorships run
  Thursday: Podcast episodes drop (coordinate with hosts)
  Friday:  Twitter/X "Bible AI" thread launch recap
  All week: Respond to every Reddit/Facebook comment within 4 hours
            Monitor Sentry crash-free rate hourly
            Monitor Stripe MRR dashboard daily

WEEK +1  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✦ Post-launch retrospective: conversion rate, activation rate, support ticket volume
  ✦ Churn survey sent to any user who cancels
  ✦ "Launch week" blog post + press release published
  ✦ Follow up with journalists who didn't respond
  ✦ A/B test onboarding step 1 (book picker vs. goal picker first)

  ★ MILESTONE: 100 paid subscribers OR 500 active free users

WEEK +2  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✦ First cohort retention analysis (Day-7 return rate)
  ✦ Email sequence optimization based on open/click data
  ✦ SEO rank tracking: target keywords in top 20?
  ✦ First paid ads test (Google "Bible study app" + Facebook retargeting) if organic CAC <$20

  ★ MILESTONE: Day-7 retention ≥40%

WEEK +3  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✦ Identify top 20 power users; invite to advisory board / testimonial program
  ✦ Ship highest-voted beta feedback items
  ✦ Referral program launch (in-app "invite a friend" with Pro reward)
  ✦ Ministry tier case study published (with seminary partner)

WEEK +4  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✦ Full funnel audit: Acquisition → Activation → Retention → Revenue → Referral
  ✦ Day-30 cohort retention target: ≥25%
  ✦ LTV:CAC ratio target: ≥3:1
  ✦ Decide: double down on SEO, paid, or partnerships based on CAC data
  ✦ Roadmap for next quarter based on usage data

  ★ MILESTONE: MRR ≥ $2,000; referral loop measurably contributing to signups
```

---

## 3. Metrics & Instrumentation

### 3.1 The Five Core Metrics (AARRR)

| Layer | Metric | Target (30-day post-launch) | Why it matters for Zero1 |
|-------|--------|----------------------------|--------------------------|
| **Acquisition** | Organic signups / week | 200+ | Bible study is high-intent search; organic should dominate |
| **Activation** | % users who complete onboarding AND run first AI query within 24 h | ≥60% | First AI query is the "aha moment" — graph + response = hook |
| **Retention** | Day-7 return rate | ≥40% | Signals daily study habit formation |
| | Day-30 return rate | ≥25% | SaaS benchmark for durable retention |
| | Weekly study streak length (median) | ≥4 days | Streak = switching cost accumulator |
| **Revenue** | Free → Pro conversion rate | ≥5% of actives | Industry SaaS benchmark; Bible niche can achieve 8–12% |
| | Monthly churn rate | ≤3% | Subscriptions must be sticky |
| | LTV:CAC ratio | ≥3:1 | Minimum viable unit economics |
| **Referral** | Referral-sourced signups / total signups | ≥15% | Social proof in faith communities travels fast |
| | Viral coefficient (K-factor) | ≥0.3 | K > 1 = organic growth loop |

### 3.2 Zero1-Specific Product Metrics

| Metric | How to Measure | Supabase / Event Source | Target |
|--------|----------------|------------------------|--------|
| AI queries per active user per week | `verse_analytics` query count aggregation | API `/ai/query` endpoint log | ≥8 queries/week |
| Graph visualization engagement rate | % of sessions that open the map view | Custom event `map_view_opened` | ≥30% of sessions |
| Annotation depth | Highlights + margin notes per user | `highlights` + `margin_notes` table row count | ≥5 annotations by Day-7 |
| Cross-reference follows | Clicks on semantic connection links | Custom event `cross_ref_clicked` | ≥3 per session |
| Export / share actions | PDF exports + share card generations | API endpoint hit counts | ≥1 per week for retained users |
| Multi-platform adoption | % of users active on ≥2 platforms | `user_sessions` platform column | ≥20% (drives switching cost) |
| Streak at churn | Average streak length when user churns | `study_streaks` at cancellation | Inversely correlated with churn — track to optimize |

### 3.3 Instrumentation Tasks

#### Event Tracking (ship before launch)

All events should be emitted from the API and stored in Supabase `analytics_events` table AND forwarded to a BI tool. Use a single `track(userId, event, properties)` helper wrapping both.

```typescript
// apps/api/src/analytics.ts — single tracking surface
export type TrackableEvent =
  | 'onboarding_step_completed'    // { step: 1-5 }
  | 'first_ai_query'               // { book, chapter }
  | 'ai_query'                     // { model, cached: boolean, latency_ms }
  | 'map_view_opened'              // { verse_count }
  | 'cross_ref_clicked'            // { from_verse, to_verse }
  | 'annotation_created'           // { type: 'highlight' | 'note' }
  | 'export_generated'             // { format: 'pdf' | 'json' | 'csv' }
  | 'share_card_created'           // { verse_ref }
  | 'streak_extended'              // { current_streak }
  | 'streak_broken'                // { broken_at_streak }
  | 'upgrade_started'              // { from_tier, to_tier }
  | 'upgrade_completed'            // { tier, billing_interval }
  | 'referral_sent'                // { channel: 'link' | 'email' }
  | 'referral_converted'           // { referrer_user_id }
  | 'session_start'                // { platform: 'web' | 'mobile' | 'desktop' }
  | 'search_performed';            // { query_length, results_count }
```

**Required instrumentation tasks:**

| # | Task | Owner | Effort | Done Criteria |
|---|------|-------|--------|---------------|
| M-1 | Add `analytics_events` table to Supabase (userId, event, properties JSONB, created_at) | Engineer | S | Table created, RLS allows insert by authenticated users |
| M-2 | Implement `track()` helper in API middleware | Engineer | S | All events in table above fire correctly in staging |
| M-3 | Instrument all AI query endpoints with `ai_query` event + latency | Engineer | S | Latency tracked on 100% of requests |
| M-4 | Instrument onboarding wizard (each step completion) | Engineer | S | Funnel visible in analytics within 1 day of shipping |
| M-5 | Instrument map view open, cross-ref clicks, annotation creates | Engineer | S | Events fire on all platforms (web + mobile) |
| M-6 | Instrument upgrade flow (started + completed + abandoned) | Engineer | S | Stripe webhook + frontend events cross-corroborated |
| M-7 | Add `platform` field to all session events | Engineer | S | Multi-platform adoption metric calculable |
| M-8 | Build Supabase SQL views for each AARRR metric | Engineer | M | Views queryable; refresh in <5 s |
| M-9 | Forward events to PostHog free tier (product analytics, funnels, session replays) | Engineer | S | PostHog project receiving events; funnel chart for onboarding visible |
| M-10 | Set up Sentry performance alerts (P95 AI latency >5 s = alert) | Engineer | S | Alert fires in test; PagerDuty or email notification configured |

### 3.4 Dashboards

#### Dashboard 1: Launch Command Center (real-time, launch week)

Hosted in PostHog or a Supabase + Grafana setup. Visible on a shared screen for the team during launch.

| Panel | Metric | Refresh |
|-------|--------|---------|
| New sign-ups today | `COUNT(users WHERE created_at > today)` | 1 min |
| Activation rate (today) | `% who completed onboarding + first query` | 5 min |
| Active sessions (live) | PostHog session count | Live |
| AI queries / hour | `analytics_events WHERE event='ai_query'` | 1 min |
| Stripe MRR delta today | Stripe Dashboard widget | 5 min |
| Crash-free rate | Sentry widget | 5 min |
| API P95 latency | Sentry performance | 1 min |

#### Dashboard 2: Retention & Health (weekly review)

| Panel | Metric |
|-------|--------|
| Day-1 / Day-7 / Day-30 retention curves | Cohort analysis (PostHog or Mixpanel) |
| Weekly active users (WAU) trend | Rolling 8-week chart |
| Streak distribution | Histogram of study streak lengths |
| Annotation depth by cohort | Highlights+notes per user, cohorted by signup week |
| Platform split | % web / mobile / desktop by WAU |
| Feature adoption funnel | Onboarding → first query → map view → annotation → export |

#### Dashboard 3: Revenue & Growth (monthly review)

| Panel | Metric |
|-------|--------|
| MRR + MoM growth | Stripe / ChartMogul |
| Churn rate | Cancellations / start-of-month subs |
| LTV (projected 12-month) | ARPU / churn rate |
| CAC by channel | Ad spend + effort cost / new paid subs, per channel |
| LTV:CAC ratio | LTV / CAC |
| Referral coefficient (K) | Referrals sent × conversion rate |
| Free → Pro conversion by cohort | Grouped by signup source |

### 3.5 CAC/LTV Tracking Setup

| # | Task | Owner | Effort |
|---|------|-------|--------|
| M-11 | Add `signup_source` UTM parameters to all links (newsletter, Product Hunt, social, SEO) captured at signup | Engineer | S |
| M-12 | Store `signup_source` in Supabase `users` table at registration | Engineer | S |
| M-13 | Build CAC report: group paid conversions by `signup_source`, divide by channel cost | Growth | S |
| M-14 | Set up Google Analytics 4 (for SEO/content CAC) with conversion events | Engineer | S |
| M-15 | Monthly LTV calculation: `ARPU ÷ monthly_churn_rate`; track trend | Founder | S |
| M-16 | Set Stripe webhook to log subscription events to `analytics_events` | Engineer | S |

---

## Ownership Summary

| Role | Primary Responsibilities |
|------|--------------------------|
| **Founder** | Pricing decisions, press outreach, podcast appearances, ministerial partnerships, revenue dashboard, monthly LTV review |
| **Product Engineer** | Onboarding flow, paywall integration, GDPR export, analytics instrumentation, Redis cache |
| **Growth / Marketing** | Email sequences, waitlist, Reddit/Facebook seeding, newsletter sponsorships, Twitter/X, referral program |
| **Mobile Engineer** | iOS App Store submission, Android Play Store, offline sync, ASO |
| **DevOps** | API hosting upgrade, CDN configuration, auto-update signing |
| **Content Creator** | Blog posts, YouTube videos, shareable study card templates |
| **BD / Partnerships** | Seminary outreach, church coordinator campaign, micro-influencer relationships |
| **Designer** | Press kit, social card templates, onboarding UI, App Store screenshots |

---

*Generated: 2026-03-03 | Zero1 Launch Planning | Idea × Infrastructure × Distribution × Switching Cost = Durable Revenue*
