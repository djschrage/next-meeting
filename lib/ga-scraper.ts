import * as cheerio from "cheerio";

export type GAMeeting = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;

  weekday: string | null;

  startTime: string | null;
  endTime: string | null;

  timezoneText: string | null;

  zoomId: string | null;
  password: string | null;
  zoomUrl: string | null;

  sourceUrl: string;
};

const GA_BASE =
  "https://gamblersanonymous.org";

function cleanText(
  value: string
) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(
  url: string
): Promise<string> {
  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NextMeeting/1.0)",

        Accept:
          "text/html,application/xhtml+xml",
      },

      cache: "no-store",
    });

  if (!response.ok) {
    throw new Error(
      `GA returned HTTP ${response.status}`
    );
  }

  return response.text();
}

function buildSearchUrl(
  weekday: string,
  page: number
) {
  const params =
    new URLSearchParams({
      city: "",
      country:
        "united states",
      term: "133",
      weekday,
    });

  if (page > 1) {
    params.set(
      "paged",
      String(page)
    );
  }

  return (
    `${GA_BASE}/virtual-meetings/?` +
    params.toString()
  );
}

function parseLocation(
  location: string
) {
  const cleaned =
    cleanText(location);

  const parts =
    cleaned
      .split(",")
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  let city:
    string | null = null;

  let state:
    string | null = null;

  let country:
    string | null = null;

  if (
    parts.length >= 3
  ) {
    city =
      parts
        .slice(
          0,
          parts.length - 2
        )
        .join(", ");

    state =
      parts[
        parts.length - 2
      ];

    country =
      parts[
        parts.length - 1
      ];
  } else if (
    parts.length === 2
  ) {
    state =
      parts[0];

    country =
      parts[1];
  } else if (
    parts.length === 1
  ) {
    state =
      parts[0];
  }

  return {
    location:
      cleaned || null,

    city,
    state,
    country,
  };
}

function parseZoomId(
  text: string
) {
  const match =
    text.match(
      /Zoom\s*(?:Meeting\s*)?ID\s*:?\s*([0-9][0-9\s#-]{7,22})/i
    );

  if (!match) {
    return null;
  }

  const value =
    match[1].replace(
      /\D/g,
      ""
    );

  if (
    value.length < 9 ||
    value.length > 12
  ) {
    return null;
  }

  return value;
}

function parsePassword(
  text: string
) {
  const match =
    text.match(
      /(?:Access\s*Code(?:\/Password)?|Passcode|Password)\s*:?\s*([A-Za-z0-9!@#$%^&*._-]+)/i
    );

  if (!match) {
    return null;
  }

  const value =
    match[1]
      .replace(
        /#+$/,
        ""
      )
      .trim();

  if (!value) {
    return null;
  }

  const badValues =
    new Set([
      "link",
      "click",
      "here",
      "zoom",
      "none",
      "n/a",
    ]);

  if (
    badValues.has(
      value.toLowerCase()
    )
  ) {
    return null;
  }

  return value;
}

function parseTimezone(
  text: string
) {
  /*
   * GA uses several variations:
   *
   * Eastern Time
   * Eastern Time Zone
   * Central time
   * Pacific Standard Time
   */

  const match =
    text.match(
      /\b(Eastern|Central|Mountain|Pacific)\s+(?:(?:Standard|Daylight)\s+)?Time(?:\s+Zone)?\b/i
    );

  return (
    match?.[0] ??
    null
  );
}

function parseZoomUrl(
  text: string
) {
  const match =
    text.match(
      /https:\/\/[^\s"'<>]*zoom\.us\/j\/\d+[^\s"'<>]*/i
    );

  if (!match) {
    return null;
  }

  return match[0]
    .replace(
      /[),.;]+$/,
      ""
    );
}

function parseSearchResults(
  html: string,
  weekday: string,
  searchUrl: string
): GAMeeting[] {
  const $ =
    cheerio.load(html);

  $(
    "script, style, nav, footer, form"
  ).remove();

  /*
   * Grab visible page text.
   *
   * We then isolate everything after
   * "Search Results".
   */
  const bodyText =
    cleanText(
      $("body").text()
    );

  const marker =
    bodyText.search(
      /Search Results/i
    );

  if (marker < 0) {
    console.warn(
      `GA ${weekday}: Search Results marker not found`
    );

    return [];
  }

  let resultsText =
    bodyText.slice(
      marker +
        "Search Results".length
    );

  /*
   * Remove the explanatory footer.
   */
  const footerMarker =
    resultsText.search(
      /\bClosed Meeting\s+Only those with a gambling problem/i
    );

  if (
    footerMarker >= 0
  ) {
    resultsText =
      resultsText.slice(
        0,
        footerMarker
      );
  }

  /*
   * GA results follow a very useful
   * textual pattern:
   *
   * LOCATION - WEEKDAY
   * Time: ...
   *
   * The next meeting starts when the
   * next LOCATION - DAY Time: appears.
   *
   * We deliberately parse the text
   * rather than relying on GA's DOM
   * structure.
   */
  const meetingStartRegex =
    /(.+?)\s*[-–—]\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s*\([^)]*\))?\s*Time\s*:/gi;

  const matches =
    Array.from(
      resultsText.matchAll(
        meetingStartRegex
      )
    );

  if (
    matches.length === 0
  ) {
    console.warn(
      `GA ${weekday}: no meeting text patterns found`
    );

    return [];
  }

  const meetings:
    GAMeeting[] = [];

  for (
    let i = 0;
    i < matches.length;
    i++
  ) {
    const match =
      matches[i];

    const detectedWeekday =
      match[2];

    /*
     * Search results should already
     * be filtered, but this prevents
     * unrelated days from leaking in.
     */
    if (
      detectedWeekday.toLowerCase() !==
      weekday.toLowerCase()
    ) {
      continue;
    }

    const locationText =
      cleanText(
        match[1]
      );

    /*
     * If the regex consumed pagination
     * text before the location, keep
     * only the text after it.
     */
    const cleanedLocation =
      locationText
        .replace(
          /^.*?(?:Reset\s+)?(?=[A-Za-z])/,
          ""
        )
        .trim();

    const detailsStart =
      (match.index ?? 0) +
      match[0].length;

    const detailsEnd =
      i + 1 <
      matches.length
        ? matches[
            i + 1
          ].index ??
          resultsText.length
        : resultsText.length;

    const details =
      cleanText(
        resultsText.slice(
          detailsStart,
          detailsEnd
        )
      );

    const timeMatch =
      details.match(
        /^\s*(\d{1,2}:\d{2}\s*[AP]M)(?:\s*-\s*(\d{1,2}:\d{2}\s*[AP]M))?/i
      );

    if (!timeMatch) {
      continue;
    }

    const startTime =
      timeMatch[1];

    const endTime =
      timeMatch[2] ??
      null;

    const location =
      parseLocation(
        cleanedLocation
      );

    const zoomId =
      parseZoomId(
        details
      );

    let zoomUrl =
      parseZoomUrl(
        details
      );

    if (
      !zoomUrl &&
      zoomId
    ) {
      zoomUrl =
        `https://zoom.us/j/${zoomId}`;
    }

    /*
     * Search-page-only mode means we
     * don't necessarily have a unique
     * GA detail URL for every result.
     *
     * Link back to the exact GA search
     * page instead.
     */
    meetings.push({
      ...location,

      weekday:
        detectedWeekday,

      startTime,
      endTime,

      timezoneText:
        parseTimezone(
          details
        ),

      zoomId,

      password:
        parsePassword(
          details
        ),

      zoomUrl,

      sourceUrl:
        searchUrl,
    });
  }

  return meetings;
}

export async function scrapeGAMeetingsForDay(
  weekday: string
): Promise<GAMeeting[]> {
  const meetings:
    GAMeeting[] = [];

  const seen =
    new Set<string>();

  /*
   * IMPORTANT:
   *
   * Because the weekday filter should
   * dramatically reduce results, we
   * expect only a small number of
   * search pages.
   *
   * Hard ceiling protects GA from an
   * accidental pagination loop.
   */
  const MAX_PAGES = 10;

  for (
    let page = 1;
    page <= MAX_PAGES;
    page++
  ) {
    const url =
      buildSearchUrl(
        weekday,
        page
      );

    console.log(
      `GA ${weekday}: search page ${page}`
    );

    let html: string;

    try {
      html =
        await fetchHtml(
          url
        );
    } catch (error) {
      console.error(
        `GA ${weekday}: page ${page} failed`,
        error
      );

      break;
    }

    const pageMeetings =
      parseSearchResults(
        html,
        weekday,
        url
      );

    console.log(
      `GA ${weekday}: found ${pageMeetings.length} meetings on page ${page}`
    );

    if (
      pageMeetings.length ===
      0
    ) {
      break;
    }

    let added = 0;

    for (
      const meeting
      of pageMeetings
    ) {
      /*
       * We no longer have a unique
       * detail-page URL, so construct
       * a meeting identity from the
       * actual listing.
       */
      const key =
        [
          meeting.location,
          meeting.weekday,
          meeting.startTime,
          meeting.zoomId,
        ].join("|");

      if (
        seen.has(key)
      ) {
        continue;
      }

      seen.add(key);

      meetings.push(
        meeting
      );

      added++;
    }

    /*
     * Pagination repeated itself.
     */
    if (added === 0) {
      break;
    }
  }

  console.log(
    `GA ${weekday}: ${meetings.length} total`
  );

  return meetings;
}