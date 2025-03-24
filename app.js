const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Twilio webhook
app.post("/twilio-voice", async (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hej! Du pratar med en AI-assistent. Vad kan jag hjälpa dig med?</Say>
  <Record maxLength="10" action="/process-recording" />
</Response>`;
  res.type("text/xml").send(twiml);
});

app.post("/process-recording", async (req, res) => {
  const recordingUrl = req.body.RecordingUrl;

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
        params: { model: "whisper-1" },
      }
    );

    const userText = whisperResponse.data.text;

    const gptResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-1106-preview",
        messages: [
          { role: "system", content: "Du är en hjälpsam AI-telefonist." },
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

    const speechResponse = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "tts-1",
        input: aiReply,
        voice: "nova",
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
    console.error("Fel:", err);
    res.type("text/xml").send(`<Response><Say>Tyvärr uppstod ett fel.</Say></Response>`);
  }
});

app.use("/response.mp3", express.static("public/response.mp3"));

app.listen(port, () => {
  console.log(`Servern körs på port ${port}`);
});
