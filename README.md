# Memphis 2-1-1 Reimagined (LINC Resource Hub)

A modernized, accessible web directory and interactive assistant designed to connect Memphis and Shelby County residents with essential community resources, including food pantries, emergency shelter, rent and utility assistance, clinics, legal aid, and transit.

**Live Demo (Hosted on Netlify):** https://memphis-2-1-1.netlify.app/

![Memphis 2-1-1 Homepage](211%20homepage.png)

## Key Features

* **Live Civic Data Integration:** Pulls real-time Memphis facility records directly from the [Data Midsouth Open Data API](https://www.datamidsouth.org/) (`memphis-community-centers0`) with `sessionStorage` caching and local JSON fallbacks.

* **Smart Resource Assistant (Chatbot):** Matches natural-language needs and Memphis ZIP codes (e.g., `"Food 38126"`, `"Clinic 38118"`, `"MLGW"`) to curated local programs and live directory results.

* **Direct LINC / 2-1-1 Taxonomy Deep-Linking:** Maps 460+ official LINC 2-1-1 service categories directly to their filtered [CommunityOS Guided Search](https://team211.communityos.org/linc211memphis) views so residents land on verified local providers in one click.
* **Accessibility & User Safety Controls:** Built-in text zoom (`100%–150%`), English/Spanish toggle, Web Speech API read-aloud support, keyboard/ARIA navigation, and a one-click **Quick Exit** button that clears session history.

* **SMS Webhook Ready:** Includes a FastAPI + Twilio webhook handler (`sms_server.py`) to extend the exact same resource search and intent logic over text message.

![Memphis 2-1-1 Assistant](211%20chatbot2.png)

## Tech Stack

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+), Web Speech API, Font Awesome

* **Data & APIs:** Data Midsouth Explore API v2.1, LINC / 2-1-1 CommunityOS Taxonomy Mapping

* **Optional SMS Backend:** Python, FastAPI, HTTPX, Twilio TwiML

## Project Structure

```text
211Reimagined/
├── 211-website/
│   ├── index.html               # Main accessible resource hub UI
│   ├── styles.css               # Responsive layout & mobile chat viewport rules
│   ├── app.js                   # Live API fetching, ZIP parsing, chatbot & deep links
│   ├── sms_server.py            # Optional FastAPI + Twilio SMS webhook
│   ├── admin/                   # Admin portal prototype
│   └── data/
│       ├── categories.simple.json
│       ├── intents.json
│       ├── resources.sample.json
│       └── taxonomy.json
├── 211 homepage.png
├── 211 chatbot2.png
├── requirements.txt
├── .gitignore
└── README.md