import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const BASE_URL = "https://gamblersanonymous.org";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const PAGE_DELAY_MS = 8000;
const DAY_DELAY_MS = 15000;
const MAX_PAGES = 30;

const DATA_DIR = path.join(process.cwd(), "data");
const OUTPUT_FILE = path.join(DATA_DIR, "ga-meetings.json");
const CHECKPOINT_FILE = path.join(
  DATA_DIR,
  "ga-collector-checkpoint.json"
);

fs.mkdirSync(DATA_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUrl(weekday, page) {
  const params = new URLSearchParams();

  params.set("city", "");
  params.set("country", "united states");
  params.set("term", "133");
  params.set("weekday", weekday);
  params.set("paged", String(page));

  return `${BASE_URL}/virtual-meetings/?${params.toString()}`;
}

function isVerificationPage(html) {
  return (
    /One moment,\s*please/i.test(html) ||
    /request is being verified/i.test(html) ||
    /webdriverCheck/i.test(html)
  );
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (isVerificationPage(html)) {
    throw new Error("GA returned its verification page.");
  }

  return html;
}

function parseTime(text) {
  const match = text.match(
    /Time\s*:?\s*(\d{1,2}:\d{2}\s*[AP]M)(?:\s*-\s*(\d{1,2}:\d{2}\s*[AP]M))?/i
  );

  return {
    startTime: match?.[1] ? clean(match[1]) : null,
    endTime: match?.[2] ? clean(match[2]) : null,
  };
}

function parseZoomId(text) {
  const match = text.match(
    /Zoom\s*(?:Meeting\s*)?ID\s*:?\s*([0-9][0-9\s-]{7,20})/i
  );

  if (!match) {
    return null;
  }

  const digits = match[1].replace(/\D/g, "");

  if (digits.length < 9 || digits.length > 12) {
    return null;
  }

  return digits;
}

function parsePassword(text) {
  const match = text.match(
    /(?:Access\s*Code(?:\/Password)?|Passcode|Password)\s*:?\s*([^\s<]+)/i
  );

  if (!match) {
    return null;
  }

  const value = clean(match[1]);

  if (!value) {
    return null;
  }

  const badValues = new Set([
    "link",
    "click",
    "here",
    "zoom",
    "none",
    "n/a",
  ]);

  if (badValues.has(value.toLowerCase())) {
    return null;
  }

  return value;
}

function parseTimezone(text) {
  const match = text.match(
    /(Eastern|Central|Mountain|Pacific)\s+(?:(?:Standard|Daylight)\s+)?Time(?:\s+Zone)?/i
  );

  return match ? clean(match[0]) : null;
}

function parseLocation(title, weekday) {
  const location = clean(
    title.replace(
      new RegExp(`\\s*[–—-]\\s*${weekday}\\s*$`, "i"),
      ""
    )
  );

  const parts = location
    .split(",")
    .map(clean)
    .filter(Boolean);

  let city = null;
  let state = null;
  let country = null;

  if (parts.length >= 3) {
    country = parts[parts.length - 1];
    state = parts[parts.length - 2];
    city = parts.slice(0, -2).join(", ");
  } else if (parts.length === 2) {
    state = parts[0];
    country = parts[1];
  } else if (parts.length === 1) {
    state = parts[0];
  }

  return {
    location,
    city,
    state,
    country,
  };
}

function findZoomUrl($, card) {
  let result = null;

  card.find("a[href]").each((_, element) => {
    if (result) {
      return;
    }

    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    let url;

    try {
      url = new URL(href, BASE_URL).toString();
    } catch {
      return;
    }

    if (/zoom\.us\/j\/\d+/i.test(url)) {
      result = url;
    }
  });

  return result;
}

function parseMeetings(html, expectedWeekday) {
  const $ = cheerio.load(html);
  const meetings = [];

  $('a[href*="/find-a-meeting/"] > div > h4').each(
    (_, headingElement) => {
      const heading = $(headingElement);

      const card = heading.parent("div");
      const anchor = card.parent("a");

      if (!card.length || !anchor.length) {
        return;
      }

      const title = clean(heading.text());
      const sourceHref = anchor.attr("href");

      if (!title || !sourceHref) {
        return;
      }

      const weekdayMatch = title.match(
        /[–—-]\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*$/i
      );

      if (!weekdayMatch) {
        return;
      }

      const weekday = weekdayMatch[1];

      if (
        weekday.toLowerCase() !==
        expectedWeekday.toLowerCase()
      ) {
        return;
      }

      const text = clean(card.text());

      const { startTime, endTime } = parseTime(text);

      if (!startTime) {
        return;
      }

      const location = parseLocation(title, weekday);

      const zoomId = parseZoomId(text);
      const password = parsePassword(text);

      let zoomUrl = findZoomUrl($, card);

      if (!zoomUrl && zoomId) {
        zoomUrl = `https://zoom.us/j/${zoomId}`;
      }

      let sourceUrl;

      try {
        sourceUrl = new URL(
          sourceHref,
          BASE_URL
        ).toString();
      } catch {
        return;
      }

      meetings.push({
        ...location,
        weekday,
        startTime,
        endTime,
        timezoneText: parseTimezone(text),
        zoomId,
        password,
        zoomUrl,
        sourceUrl,
      });
    }
  );

  return meetings;
}

function getLastPage(html) {
  const $ = cheerio.load(html);

  let lastPage = 1;

  $(".pagination a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    const decoded = href.replace(/&#038;/g, "&");

    const match = decoded.match(/[?&]paged=(\d+)/i);

    if (!match) {
      return;
    }

    const page = Number(match[1]);

    if (Number.isFinite(page)) {
      lastPage = Math.max(lastPage, page);
    }
  });

  return Math.min(lastPage, MAX_PAGES);
}

function loadMeetings() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(OUTPUT_FILE, "utf8")
    );

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed.meetings)) {
      return parsed.meetings;
    }
  } catch {
    // Ignore malformed old data.
  }

  return [];
}

function loadCheckpoint() {
  const fallback = {
    completedDays: [],
    progress: {},
  };

  if (!fs.existsSync(CHECKPOINT_FILE)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(CHECKPOINT_FILE, "utf8")
    );

    return {
      completedDays: Array.isArray(parsed.completedDays)
        ? parsed.completedDays
        : [],
      progress:
        parsed.progress &&
        typeof parsed.progress === "object"
          ? parsed.progress
          : {},
    };
  } catch {
    return fallback;
  }
}

function saveMeetings(meetingMap) {
  const meetings = Array.from(meetingMap.values());

  meetings.sort((a, b) => {
    const dayDifference =
      WEEKDAYS.indexOf(a.weekday) -
      WEEKDAYS.indexOf(b.weekday);

    if (dayDifference !== 0) {
      return dayDifference;
    }

    return String(a.startTime).localeCompare(
      String(b.startTime)
    );
  });

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source:
          "Gamblers Anonymous public virtual meeting listings",
        meetingCount: meetings.length,
        meetings,
      },
      null,
      2
    ),
    "utf8"
  );
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify(
      {
        completedDays: checkpoint.completedDays,
        progress: checkpoint.progress,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function storeMeetings(meetings, meetingMap) {
  for (const meeting of meetings) {
    /*
     * Detail-page URL is our unique key.
     *
     * We intentionally do NOT dedupe by Zoom ID.
     */
    meetingMap.set(
      meeting.sourceUrl,
      meeting
    );
  }

  saveMeetings(meetingMap);
}

function countDayMeetings(meetingMap, weekday) {
  return Array.from(meetingMap.values()).filter(
    (meeting) => meeting.weekday === weekday
  ).length;
}

async function collectDay(
  weekday,
  meetingMap,
  checkpoint
) {
  console.log("");
  console.log(`=== ${weekday} ===`);

  const savedProgress =
    checkpoint.progress[weekday] ?? {};

  const lastSuccessfulPage =
    Number(savedProgress.lastSuccessfulPage) || 0;

  let page =
    lastSuccessfulPage > 0
      ? lastSuccessfulPage + 1
      : 1;

  let expectedLastPage =
    Number(savedProgress.expectedLastPage) || null;

  if (lastSuccessfulPage > 0) {
    console.log(
      `Resuming after page ${lastSuccessfulPage}...`
    );

    console.log(
      `${countDayMeetings(
        meetingMap,
        weekday
      )} ${weekday} meetings already saved`
    );
  }

  while (page <= MAX_PAGES) {
    /*
     * If we already know GA's advertised final page
     * and we've gone beyond it, the day is done.
     */
    if (
      expectedLastPage &&
      page > expectedLastPage
    ) {
      console.log(
        `Reached advertised end of ${weekday}.`
      );

      break;
    }

    if (page > 1) {
      console.log(
        `Waiting ${PAGE_DELAY_MS / 1000}s...`
      );

      await sleep(PAGE_DELAY_MS);
    }

    if (expectedLastPage) {
      console.log(
        `Fetching page ${page}/${expectedLastPage}...`
      );
    } else {
      console.log(
        `Fetching page ${page}...`
      );
    }

    const html = await fetchHtml(
      buildUrl(weekday, page)
    );

    const meetings = parseMeetings(
      html,
      weekday
    );

    /*
     * Page 1 being empty is suspicious.
     *
     * Any later empty page simply means we've
     * reached the end of that weekday's results.
     */
    if (meetings.length === 0) {
      if (page === 1) {
        throw new Error(
          `${weekday} page 1 returned real HTML but parsed zero meeting cards.`
        );
      }

      console.log("");
      console.log(
        `No meetings found on page ${page}.`
      );

      console.log(
        `Treating this as the end of ${weekday}.`
      );

      break;
    }

    console.log(
      `Found ${meetings.length} meetings`
    );

    /*
     * Refresh our understanding of pagination
     * from each successful page.
     */
    const advertisedLastPage =
      getLastPage(html);

    if (
      advertisedLastPage > 1 &&
      (
        !expectedLastPage ||
        advertisedLastPage > expectedLastPage
      )
    ) {
      expectedLastPage =
        advertisedLastPage;

      console.log(
        `GA reports up to page ${expectedLastPage}`
      );
    }

    storeMeetings(
      meetings,
      meetingMap
    );

    /*
     * PAGE-LEVEL CHECKPOINT.
     *
     * Once this is written, we never need to
     * intentionally fetch this page again.
     */
    checkpoint.progress[weekday] = {
      lastSuccessfulPage: page,
      expectedLastPage,
    };

    saveCheckpoint(checkpoint);

    console.log(
      `Saved total: ${meetingMap.size}`
    );

    console.log(
      `${weekday} total: ${countDayMeetings(
        meetingMap,
        weekday
      )}`
    );

    page++;
  }

  if (
    !checkpoint.completedDays.includes(weekday)
  ) {
    checkpoint.completedDays.push(weekday);
  }

  /*
   * Day is now complete, so page-level progress
   * is no longer needed.
   */
  delete checkpoint.progress[weekday];

  saveCheckpoint(checkpoint);
  saveMeetings(meetingMap);

  console.log("");
  console.log(
    `✓ ${weekday}: ${countDayMeetings(
      meetingMap,
      weekday
    )} meetings saved`
  );
}

async function main() {
  console.log("");
  console.log(
    "GA WEEKLY MEETING COLLECTOR"
  );
  console.log(
    "==========================="
  );

  const meetingMap = new Map();

  for (const meeting of loadMeetings()) {
    if (meeting?.sourceUrl) {
      meetingMap.set(
        meeting.sourceUrl,
        meeting
      );
    }
  }

  const checkpoint = loadCheckpoint();

  /*
   * Validate completed days against actual data.
   *
   * If an old broken checkpoint says a day is
   * complete but we have zero meetings for it,
   * discard that completion marker.
   */
  checkpoint.completedDays =
    checkpoint.completedDays.filter(
      (weekday) =>
        countDayMeetings(
          meetingMap,
          weekday
        ) > 0
    );

  saveCheckpoint(checkpoint);

  console.log("");
  console.log(
    `Existing meetings: ${meetingMap.size}`
  );

  console.log(
    `Valid completed days: ${
      checkpoint.completedDays.length
        ? checkpoint.completedDays.join(", ")
        : "none"
    }`
  );

  const activeProgressDays =
    Object.keys(checkpoint.progress);

  if (activeProgressDays.length) {
    console.log("");
    console.log("Saved page progress:");

    for (const weekday of activeProgressDays) {
      console.log(
        `  ${weekday}: through page ${
          checkpoint.progress[weekday]
            .lastSuccessfulPage ?? 0
        }`
      );
    }
  }

  for (
    let i = 0;
    i < WEEKDAYS.length;
    i++
  ) {
    const weekday = WEEKDAYS[i];

    if (
      checkpoint.completedDays.includes(
        weekday
      )
    ) {
      console.log("");
      console.log(
        `✓ ${weekday} already completed`
      );

      continue;
    }

    try {
      await collectDay(
        weekday,
        meetingMap,
        checkpoint
      );
    } catch (error) {
      console.error("");
      console.error(
        "COLLECTION STOPPED"
      );
      console.error(
        "=================="
      );

      console.error(
        error instanceof Error
          ? error.message
          : String(error)
      );

      console.error("");
      console.error(
        "Everything successfully collected before this point remains saved."
      );

      console.error(
        "The next run will resume from the last successful page."
      );

      /*
       * Don't use process.exit().
       *
       * This lets Node's fetch handles close
       * normally on Windows.
       */
      process.exitCode = 1;
      return;
    }

    if (i < WEEKDAYS.length - 1) {
      console.log(
        `Waiting ${DAY_DELAY_MS / 1000}s before next day...`
      );

      await sleep(DAY_DELAY_MS);
    }
  }

  saveMeetings(meetingMap);
  saveCheckpoint(checkpoint);

  console.log("");
  console.log(
    "==========================="
  );
  console.log(
    "COLLECTION COMPLETE"
  );
  console.log(
    `Total meetings: ${meetingMap.size}`
  );
  console.log(
    `Saved to: ${OUTPUT_FILE}`
  );
  console.log(
    "==========================="
  );
}

await main();