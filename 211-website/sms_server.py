import os
import re
import json
import httpx
from fastapi import FastAPI, Form, Response
from twilio.twiml.messaging_response import MessagingResponse

app = FastAPI()

DMS_CENTERS_API = "https://www.datamidsouth.org/api/explore/v2.1/catalog/datasets/memphis-community-centers0/records"

# Load your existing JSON files from 211-website/data/
with open("../211-website/data/intents.json", "r", encoding="utf-8") as f:
    INTENTS = json.load(f)

with open("../211-website/data/resources.sample.json", "r", encoding="utf-8") as f:
    SAMPLE_RESOURCES = json.load(f)


def strip_html(html_text: str) -> str:
    # Convert <br/> to newlines and extract URLs cleanly for SMS
    text = re.sub(r"<br\s*/?>", "\n", html_text)
    text = re.sub(r'<a[^>]*href="([^"]+)"[^>]*>([^<]+)</a>', r"\2 (\1)", text)
    return re.sub(r"<[^>]+>", "", text).strip()


def extract_zip_and_query(raw: str):
    zip_match = re.search(r"\b(38\d{3})\b", raw)
    zip_code = zip_match.group(1) if zip_match else ""
    keyword = re.sub(r"\b38\d{3}\b", "", raw).strip()
    return keyword, zip_code


async def search_memphis(keyword: str, zip_code: str):
    results = []
    where = []
    if keyword:
        where.append(f'search("{keyword}")')
    if zip_code:
        where.append(f'search("{zip_code}")')

    params = {"limit": "3"}
    if where:
        params["where"] = " AND ".join(where)

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(DMS_CENTERS_API, params=params)
            if r.status_code == 200:
                for rec in r.json().get("results", []):
                    name = rec.get("name") or rec.get("center_name") or "Memphis Community Center"
                    phone = rec.get("phone") or "(901) 636-4200"
                    addr = rec.get("address") or "Memphis, TN"
                    results.append(f"- {name}: {phone} | {addr}")
    except Exception:
        pass

    # Also check local sample JSON
    for r in SAMPLE_RESOURCES:
        blob = f"{r['name']} {' '.join(r['services'])} {r['description']} {r['zip']}".lower()
        if (not keyword or keyword.lower() in blob) and (not zip_code or r["zip"] == zip_code):
            results.append(f"- {r['name']}: {r['phone']} | {r['address']}")

    return results[:3]


@app.post("/sms")
async def sms_reply(Body: str = Form(...)):
    user_msg = Body.strip()
    keyword, zip_code = extract_zip_and_query(user_msg)
    reply_parts = []

    # 1. Check intents.json
    q_norm = (keyword or user_msg).lower()
    for intent in INTENTS:
        if any(k.lower() in q_norm for k in intent.get("keywords", [])):
            reply_parts.append(strip_html(intent["reply_html"]))
            break

    # 2. Fetch live Data Midsouth + local hits
    hits = await search_memphis(keyword or user_msg, zip_code)
    if hits:
        header = f"Memphis resources{f' near {zip_code}' if zip_code else ''}:"
        reply_parts.append(header + "\n" + "\n".join(hits))

    if not reply_parts:
        reply_parts.append(
            "Memphis 211: Reply with a need and ZIP (e.g., 'Food 38126', 'Shelter', 'Clinic 38118') or call 2-1-1."
        )

    # Keep SMS concise (under ~480 chars / 3 segments)
    final_text = "\n\n".join(reply_parts)[:480]

    twiml = MessagingResponse()
    twiml.message(final_text)
    return Response(content=str(twiml), media_type="application/xml")