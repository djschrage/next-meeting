import fs from "node:fs";
import * as cheerio from "cheerio";

const FILE = "ga-monday.html";

if (!fs.existsSync(FILE)) {
  console.error(`Cannot find ${FILE}`);
  process.exitCode = 1;
} else {
  const html = fs.readFileSync(FILE, "utf8");
  const $ = cheerio.load(html);

  const meetings = [];

  $('a[href*="/find-a-meeting/"]').each((index, element) => {
    const anchor = $(element);
    const card = anchor.children("div").first();

    if (!card.length) {
      return;
    }

    const heading = card
      .find("h4")
      .first()
      .text()
      .trim();

    if (!heading) {
      return;
    }

    meetings.push({
      url: anchor.attr("href"),
      heading,
      text: card
        .text()
        .replace(/\s+/g, " ")
        .trim(),
    });
  });

  console.log("");
  console.log("GA LOCAL PARSER TEST");
  console.log("====================");
  console.log(`HTML length: ${html.length}`);
  console.log(`Matching meetings: ${meetings.length}`);
  console.log("");

  for (const meeting of meetings) {
    console.log(meeting.heading);
    console.log(meeting.url);
    console.log(meeting.text);
    console.log("---");
  }

  console.log("");
}