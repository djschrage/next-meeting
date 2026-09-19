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
  /*
   * IMPORTANT:
   *
   * One request.
   * No retries.
   * No detail-page requests.
   *
   * If GA is unavailable, we fail
   * gracefully rather than repeatedly
   * hammering it.
   */

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
      `${url} returned HTTP ${response.status}`
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

  /*
   * Don't add paged=1.
   * GA's normal first page does not
   * need it.
   */

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

function absoluteUrl(
  href: string
) {
  try {
    return new URL(
      href,
      GA_BASE
    ).toString();
  } catch {
    return href;
  }
}

function usableZoomUrl(
  href: string
) {
  return /^https:\/\/[^/]*zoom\.us\/j\/\d+/i.test(
    href
  );
}

function extractZoomId(
  text: string
) {
  const match =
    text.match(
      /Zoom\s*(?:Meeting\s*)?ID\s*:?\s*([0-9][0-9\s-]{8,20})/i
    );

  if (!match) {
    return null;
  }

  const id =
    match[1].replace(
      /\D/g,
      ""
    );

  if (
    id.length < 9 ||
    id.length > 12
  ) {
    return null;
  }

  return id;
}

function extractPassword(
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
    match[1].trim();

  /*
   * GA occasionally places link text
   * immediately after the Password
   * label. These are not passwords.
   */
  const invalidValues =
    new Set([
      "link",
      "click",
      "here",
      "zoom",
      "none",
      "n/a",
    ]);

  if (
    invalidValues.has(
      value.toLowerCase()
    )
  ) {
    return null;
  }

  return value;
}

function extractTime(
  text: string
) {
  /*
   * Examples:
   *
   * 07:00 PM
   * 08:00 PM - 09:15 PM
   */

  const match =
    text.match(
      /\b(\d{1,2}:\d{2}\s*[AP]M)(?:\s*-\s*(\d{1,2}:\d{2}\s*[AP]M))?/i
    );

  return {
    startTime:
      match?.[1] ?? null,

    endTime:
      match?.[2] ?? null,
  };
}

function extractTimezone(
  text: string
) {
  const match =
    text.match(
      /\b(Eastern|Central|Mountain|Pacific)\s+(?:(?:Standard|Daylight)\s+)?Time\b/i
    );

  return (
    match?.[0] ?? null
  );
}

function extractLocation(
  text: string,
  weekday: string
) {
  /*
   * Search cards normally start with
   * something resembling:
   *
   * Charlotte, North Carolina,
   * United States – Friday
   */

  const escapedWeekday =
    weekday.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const match =
    text.match(
      new RegExp(
        `(.+?)\\s*[–—-]\\s*${escapedWeekday}\\b`,
        "i"
      )
    );

  if (!match) {
    return {
      location: null,
      city: null,
      state: null,
      country: null,
    };
  }

  let location =
    cleanText(
      match[1]
    );

  /*
   * Strip common garbage that may
   * precede the actual result title.
   */
  const markers = [
    "My Account",
    "Search Results",
  ];

  for (
    const marker
    of markers
  ) {
    const index =
      location.lastIndexOf(
        marker
      );

    if (index >= 0) {
      location =
        location
          .slice(
            index +
              marker.length
          )
          .trim();
    }
  }

  const parts =
    location
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
      parts[
        parts.length - 3
      ];

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
    city =
      parts[0];

    state =
      parts[1];
  } else if (
    parts.length === 1
  ) {
    state =
      parts[0];
  }

  return {
    location,
    city,
    state,
    country,
  };
}

function parseMeetingBlock(
  $: cheerio.CheerioAPI,
  element: any,
  weekday: string
): GAMeeting | null {
  const block =
    $(element);

  const text =
    cleanText(
      block.text()
    );

  /*
   * A real meeting result should at
   * minimum contain the requested
   * weekday and a meeting time.
   */
  if (
    !new RegExp(
      `\\b${weekday}\\b`,
      "i"
    ).test(text)
  ) {
    return null;
  }

  const {
    startTime,
    endTime,
  } = extractTime(text);

  if (!startTime) {
    return null;
  }

  const location =
    extractLocation(
      text,
      weekday
    );

  let sourceUrl:
    string | null = null;

  let zoomUrl:
    string | null = null;

  block
    .find("a")
    .each(
      (
        _,
        anchor
      ) => {
        const href =
          $(anchor).attr(
            "href"
          );

        if (!href) {
          return;
        }

        const absolute =
          absoluteUrl(
            href
          );

        if (
          !sourceUrl &&
          absolute.startsWith(
            `${GA_BASE}/find-a-meeting/`
          ) &&
          absolute !==
            `${GA_BASE}/find-a-meeting/`
        ) {
          sourceUrl =
            absolute;
        }

        if (
          !zoomUrl &&
          usableZoomUrl(
            absolute
          )
        ) {
          zoomUrl =
            absolute;
        }
      }
    );

  /*
   * Without a source URL, this is
   * probably not an individual search
   * result.
   */
  if (!sourceUrl) {
    return null;
  }

  const zoomId =
    extractZoomId(
      text
    );

  const password =
    extractPassword(
      text
    );

  if (
    !zoomUrl &&
    zoomId
  ) {
    zoomUrl =
      `https://zoom.us/j/${zoomId}`;
  }

  return {
    ...location,

    weekday,

    startTime,
    endTime,

    timezoneText:
      extractTimezone(
        text
      ),

    zoomId,
    password,
    zoomUrl,

    sourceUrl,
  };
}

function findMeetingBlocks(
  $: cheerio.CheerioAPI,
  weekday: string
) {
  /*
   * Rather than assuming one specific
   * WordPress class name, start from
   * links to individual meeting pages
   * and walk upward until we find the
   * smallest useful result container.
   */

  const blocks: any[] =
    [];

  const seen =
    new Set<any>();

  $(
    `a[href*="/find-a-meeting/"]`
  ).each(
    (
      _,
      anchor
    ) => {
      const href =
        $(anchor).attr(
          "href"
        );

      if (!href) {
        return;
      }

      const absolute =
        absoluteUrl(
          href
        );

      if (
        absolute ===
        `${GA_BASE}/find-a-meeting/`
      ) {
        return;
      }

      let current =
        $(anchor).parent();

      let chosen:
        any = null;

      /*
       * Walk upward only a handful of
       * levels. We want the smallest
       * container containing this
       * meeting's time/details.
       */
      for (
        let depth = 0;
        depth < 7 &&
        current.length;
        depth++
      ) {
        const text =
          cleanText(
            current.text()
          );

        const hasWeekday =
          new RegExp(
            `\\b${weekday}\\b`,
            "i"
          ).test(text);

        const hasTime =
          /\b\d{1,2}:\d{2}\s*[AP]M\b/i.test(
            text
          );

        if (
          hasWeekday &&
          hasTime
        ) {
          chosen =
            current.get(0);

          break;
        }

        current =
          current.parent();
      }

      if (
        chosen &&
        !seen.has(chosen)
      ) {
        seen.add(chosen);

        blocks.push(
          chosen
        );
      }
    }
  );

  return blocks;
}

function parseSearchPage(
  html: string,
  weekday: string
) {
  const $ =
    cheerio.load(html);

  $(
    "script, style, nav, footer, form"
  ).remove();

  const blocks =
    findMeetingBlocks(
      $,
      weekday
    );

  const meetings:
    GAMeeting[] = [];

  const seenSources =
    new Set<string>();

  for (
    const block
    of blocks
  ) {
    const meeting =
      parseMeetingBlock(
        $,
        block,
        weekday
      );

    if (!meeting) {
      continue;
    }

    if (
      seenSources.has(
        meeting.sourceUrl
      )
    ) {
      continue;
    }

    seenSources.add(
      meeting.sourceUrl
    );

    meetings.push(
      meeting
    );
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
   * Safety ceiling.
   *
   * In normal operation we should
   * encounter an empty/repeating page
   * long before this.
   */
  const MAX_PAGES = 15;

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
      `GA ${weekday}: loading search page ${page}`
    );

    let html: string;

    try {
      html =
        await fetchHtml(
          url
        );
    } catch (error) {
      console.error(
        `GA ${weekday}: search page ${page} failed`,
        error
      );

      /*
       * No retries.
       *
       * Return whatever we successfully
       * collected before the failure.
       */
      break;
    }

    const pageMeetings =
      parseSearchPage(
        html,
        weekday
      );

    console.log(
      `GA ${weekday}: page ${page} produced ${pageMeetings.length} meetings`
    );

    if (
      pageMeetings.length ===
      0
    ) {
      break;
    }

    let newMeetings = 0;

    for (
      const meeting
      of pageMeetings
    ) {
      if (
        seen.has(
          meeting.sourceUrl
        )
      ) {
        continue;
      }

      seen.add(
        meeting.sourceUrl
      );

      meetings.push(
        meeting
      );

      newMeetings++;
    }

    /*
     * If an alleged next page just
     * repeats the previous results,
     * stop immediately.
     */
    if (
      newMeetings === 0
    ) {
      break;
    }
  }

  console.log(
    `GA ${weekday}: ${meetings.length} total meetings`
  );

  return meetings;
}