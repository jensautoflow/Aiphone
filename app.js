// AI-telefonist med OpenAI Voice och Twilio (Node.js + Express) – Svenska som standard

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Twilio webhook som svarar på inkommande samtal
app.post("/twilio-voice", async (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="sv-SE">
    Välkommen till AutoFlow. AutoBot heter jag och jag är er AI-assistent. 94% av alla supportärenden löser jag vanligtvis själv. Hur kan jag hjälpa dig idag?
  </Say>
  <Record maxLength="10" action="/process-recording" />
</Response>`;
  res.type("text/xml").send(twiml);
});

// Hantera inspelning från Twilio
app.post("/process-recording", async (req, res) => {
  const recordingUrl = req.body.RecordingUrl;
  console.log("Inspelning mottagen:", recordingUrl);

  try {
    const audioResponse = await axios.get(`${recordingUrl}.mp3`, {
      responseType: "arraybuffer",
    });
    fs.writeFileSync("recording.mp3", audioResponse.data);

    const whisperResponse = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      fs.createReadStream("recording.mp3"),
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "audio/mpeg",
        },
        params: { model: "whisper-1", language: "sv" },
      }
    );

    const userText = whisperResponse.data.text;
    console.log("Användarens fråga:", userText);

    const gptResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-1106-preview",
        messages: [
          {
            role: "system",
            content: `Du är en serviceinriktad kundtjänstagent för AutoFlow. Använd ett avslappnat talspråk på svenska med mellanord som 'nåt' och 'liksom'. Lägg in pauseringar med tre punkter, ett bindestreck, tre punkter och ett bindestreck (”… - … -”) i svar över 20 ord.

Avsluta första meningen i varje svar med exakt ett utropstecken (!) om den är längre än 7 ord. Använd aldrig fler än ett utropstecken totalt i ett svar. Den här regeln måste följas strikt utan undantag.

Håll alla svar under 45 ord. Undvik numrerade listor. Håll en klar och professionell ton men var supervänlig.

Erbjud endast att koppla vidare till mänsklig kundsupport om det verkligen inte finns något relevant svar. Om du erbjuder att koppla, säg exakt: “Om du vill bli kopplad, säg ‘koppla mig till…’”. Denna regel måste följas strikt utan undantag.

Digit & Phone Number Formatting:
- Skriv ut alla siffror som ord (ex. 12 → ett, två).
- Tider skrivs som ord (10:00 → tio, 8:30 → halv nio).
- Telefonnummer skrivs med kommatecken först och varje siffra som ord, med ”… - … -” mellan varje ord. Exempel: 073 → , Noll … - … - Sju … - … - Tre.
- När någon frågar om telefonnummer, presentera både ägaren och numret exakt enligt dessa regler.

Språk:
Tala endast svenska. Om någon frågar på annat språk, svara att du håller på att lära dig och snart kommer kunna föra konversationer på andra språk.`
          },
          { role: "user", content: userText },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const aiReply = gptResponse.data.choices[0].message.content;
    console.log("AI svarar:", aiReply);

    const speechResponse = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "tts-1",
        input: aiReply,
        voice: "shimmer",
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    fs.writeFileSync("public/response.mp3", speechResponse.data);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>https://${req.headers.host}/response.mp3</Play>
</Response>`;

    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("Fel i samtalsflödet:", err);
    res.type("text/xml").send(`<Response><Say>Tyvärr uppstod ett fel.</Say></Response>`);
  }
});

app.use("/response.mp3", express.static("public/response.mp3"));

app.listen(port, () => {
  console.log(`AI-telefonist live på port ${port}`);
});
