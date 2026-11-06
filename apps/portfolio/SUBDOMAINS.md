# Apps on their own subdomains

Fifteen projects have an address of their own. Gram & Pop's already had one
(gramandpops.com). Roy and Weather already had their own Hosting sites. The
other twelve each get a new Firebase Hosting site in the `josh-cocciardi`
project:

| Subdomain | Hosting site | Serves |
|---|---|---|
| partyroom.joshcocciardi.com | josh-cocciardi-partyroom | `build/projects/party-room` |
| canitwo.joshcocciardi.com | josh-cocciardi-canitwo | `build/projects/canitwo` |
| parkday.joshcocciardi.com | josh-cocciardi-parkday | `build/projects/disney-trivia`, plus the `/api/park/*` function routes |
| camboku.joshcocciardi.com | josh-cocciardi-camboku | `build/projects/camboku` |
| camboy.joshcocciardi.com | josh-cocciardi-camboy | `build/projects/camboy` |
| swingcoach.joshcocciardi.com | josh-cocciardi-swingcoach | `build/projects/swing-coach` |
| tophat.joshcocciardi.com | josh-cocciardi-tophat | `build/projects/tophat-spears` |
| mise.joshcocciardi.com | josh-cocciardi-mise | the portfolio build, showing only Mise |
| channelsurfer.joshcocciardi.com | josh-cocciardi-channelsurfer | the portfolio build, showing only Channel Surfer |
| sundaydesk.joshcocciardi.com | josh-cocciardi-sundaydesk | the portfolio build, showing only Sunday Desk |
| readingbuddy.joshcocciardi.com | josh-cocciardi-readingbuddy | the portfolio build, showing only My Reading Buddy, plus `/api/readingbuddy/file` |
| mealplanner.joshcocciardi.com | josh-cocciardi-mealplanner | the portfolio build, showing only the Meal Planner |
| roy.joshcocciardi.com | josh-cocciardi-roy (existing) | Roy |
| weather.joshcocciardi.com | josh-cocciardi-weather (existing) | Weather |

The static apps are served from the clean copy that the portfolio build already
makes under `build/projects/<app>`. The React tools all share the portfolio
build, and `src/App.js` checks the hostname (`toolForHost` in
`src/site/domains.js`) and renders that one tool at every path. The old
addresses (`/projects/party-room`, `/tools/mise` and so on) keep working.

## What happens automatically

When this merges, the **Deploy subdomain sites** step in
`.github/workflows/deploy.yml` creates any site that doesn't exist yet and
deploys all twelve. Each one is reachable straight away at
`https://josh-cocciardi-<name>.web.app`. By hand, `./deploy.sh subdomains`
does the same thing.

## What you do once, per subdomain

Connecting a custom domain can't be done from CI. It's a Firebase console step
plus DNS records at wherever joshcocciardi.com's DNS lives.

1. **Firebase console → Hosting.** Pick the site (for example
   `josh-cocciardi-partyroom`) from the site list, then **Add custom domain**
   and enter `partyroom.joshcocciardi.com`.
2. **Add the records it shows you** at your DNS provider. That is usually a TXT
   record to prove ownership, then the A records (or a CNAME) it lists for the
   subdomain.
3. **Wait for it to say Connected.** Firebase issues the HTTPS certificate on
   its own. This usually takes minutes, sometimes a few hours.
4. **Turn the link on.** In `src/site/domains.js`, set `live: true` for that
   app and merge. The home page reels, the Projects page and every card then
   link to `partyroom.joshcocciardi.com` instead of the old path.

Do step 4 only after step 3, or the site links to an address that doesn't
answer yet.

## Sign-in on the new domains

Google sign-in only works on domains listed in **Firebase console →
Authentication → Settings → Authorized domains**. Add the subdomain (and, if
you want sign-in to work there too, the `.web.app` address) for every app that
uses Google sign-in:

- canitwo.joshcocciardi.com
- swingcoach.joshcocciardi.com (the golf caddy)
- mise.joshcocciardi.com
- sundaydesk.joshcocciardi.com
- readingbuddy.joshcocciardi.com
- mealplanner.joshcocciardi.com
- roy.joshcocciardi.com

Party Room, Park Day and Tophat & Spears sign players in anonymously, which
works on any domain. Camboku and Camboy have no sign-in.

One thing to know: a sign-in belongs to the address it happened on. Someone
signed in to Mise at `joshcocciardi.com/tools/mise` signs in once more the
first time they open `mise.joshcocciardi.com`. Their data is the same, because
it's the same account.
