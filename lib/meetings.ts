import { DateTime } from "luxon";

import {
  GAMeeting,
  scrapeGAMeetingsForDay,
} from "./ga-scraper";

import {
  getMeetingTimezone,
} from "./timezones";

export type UpcomingMeeting =
  GAMeeting & {
    timezone: string;
    startsAt: string;
    endsAt: string | null;
  };

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function weekdayName(
  date: DateTime
) {
  return WEEKDAYS[
    date.weekday - 1
  ];
}

function parseTime(
  time: string
): {
  hour: number;
  minute: number;
} | null {
  const match =
    time.match(
      /^(\d{1,2}):(\d{2})\s*([AP]M)$/i
    );

  if (!match) {
    return null;
  }

  let hour =
    Number(match[1]);

  const minute =
    Number(match[2]);

  const period =
    match[3].toUpperCase();

  if (
    period === "PM" &&
    hour !== 12
  ) {
    hour += 12;
  }

  if (
    period === "AM" &&
    hour === 12
  ) {
    hour = 0;
  }

  return {
    hour,
    minute,
  };
}

function getRelevantWeekdays(
  startUtc: DateTime,
  endUtc: DateTime
) {
  /*
   * Eastern and Pacific give us
   * the calendar-day boundaries
   * covering the continental US.
   *
   * Arizona/Hawaii/etc. are still
   * covered by the resulting day
   * set around a 12-hour window.
   */

  const zones = [
    "America/New_York",
    "America/Los_Angeles",
  ];

  const weekdays =
    new Set<string>();

  for (const zone of zones) {
    const localStart =
      startUtc.setZone(zone);

    const localEnd =
      endUtc.setZone(zone);

    weekdays.add(
      weekdayName(
        localStart
      )
    );

    weekdays.add(
      weekdayName(
        localEnd
      )
    );
  }

  return Array.from(
    weekdays
  );
}

function candidateDatesForWeekday(
  weekday: string,
  now: DateTime
) {
  /*
   * Generate nearby UTC calendar
   * dates whose weekday matches
   * the GA meeting weekday.
   *
   * We only need a small envelope
   * because the final UTC-window
   * check determines whether the
   * occurrence really belongs.
   */

  const dates: DateTime[] =
    [];

  for (
    let offset = -1;
    offset <= 2;
    offset++
  ) {
    const date =
      now.plus({
        days: offset,
      });

    if (
      weekdayName(date) ===
      weekday
    ) {
      dates.push(date);
    }
  }

  return dates;
}

function meetingDateTime(
  meeting: GAMeeting,
  calendarDate: DateTime,
  timezone: string
): DateTime | null {
  if (!meeting.startTime) {
    return null;
  }

  const parsed =
    parseTime(
      meeting.startTime
    );

  if (!parsed) {
    return null;
  }

  return DateTime.fromObject(
    {
      year:
        calendarDate.year,

      month:
        calendarDate.month,

      day:
        calendarDate.day,

      hour:
        parsed.hour,

      minute:
        parsed.minute,
    },
    {
      zone: timezone,
    }
  );
}

function meetingEndDateTime(
  meeting: GAMeeting,
  calendarDate: DateTime,
  timezone: string,
  start: DateTime
): DateTime | null {
  if (!meeting.endTime) {
    return null;
  }

  const parsed =
    parseTime(
      meeting.endTime
    );

  if (!parsed) {
    return null;
  }

  let end =
    DateTime.fromObject(
      {
        year:
          calendarDate.year,

        month:
          calendarDate.month,

        day:
          calendarDate.day,

        hour:
          parsed.hour,

        minute:
          parsed.minute,
      },
      {
        zone: timezone,
      }
    );

  if (end < start) {
    end =
      end.plus({
        days: 1,
      });
  }

  return end;
}

export async function getUpcomingMeetings(
  hours = 12
): Promise<UpcomingMeeting[]> {
  const now =
    DateTime.utc();

  const cutoff =
    now.plus({
      hours,
    });

  /*
   * THIS IS THE IMPORTANT CHANGE.
   *
   * Don't scrape four arbitrary
   * weekdays.
   *
   * Determine which weekdays can
   * actually occur somewhere in
   * the US during this window.
   */

  const weekdays =
    getRelevantWeekdays(
      now,
      cutoff
    );

  console.log(
    "Scraping GA weekdays:",
    weekdays
  );

  /*
   * Scrape only those days.
   */

  const results =
    await Promise.all(
      weekdays.map(
        async (
          weekday
        ) => {
          try {
            const meetings =
              await scrapeGAMeetingsForDay(
                weekday
              );

            return {
              weekday,
              meetings,
            };
          } catch (error) {
            /*
             * One entire weekday
             * failing should not
             * destroy the others.
             */
            console.error(
              `Failed to scrape ${weekday}`,
              error
            );

            return {
              weekday,
              meetings:
                [] as GAMeeting[],
            };
          }
        }
      )
    );

  const upcoming:
    UpcomingMeeting[] = [];

  for (
    const result
    of results
  ) {
    const candidateDates =
      candidateDatesForWeekday(
        result.weekday,
        now
      );

    for (
      const meeting
      of result.meetings
    ) {
      if (
        !meeting.weekday ||
        meeting.weekday.toLowerCase() !==
          result.weekday.toLowerCase()
      ) {
        continue;
      }

      const timezone =
        getMeetingTimezone(
          meeting.city,
          meeting.state,
          meeting.timezoneText
        );

      if (!timezone) {
        continue;
      }

      for (
        const date
        of candidateDates
      ) {
        const starts =
          meetingDateTime(
            meeting,
            date,
            timezone
          );

        if (
          !starts ||
          !starts.isValid
        ) {
          continue;
        }

        const startsUtc =
          starts.toUTC();

        if (
          startsUtc < now ||
          startsUtc > cutoff
        ) {
          continue;
        }

        const ends =
          meetingEndDateTime(
            meeting,
            date,
            timezone,
            starts
          );

        upcoming.push({
          ...meeting,

          timezone,

          startsAt:
            startsUtc.toISO()!,

          endsAt:
            ends
              ? ends
                  .toUTC()
                  .toISO()
              : null,
        });
      }
    }
  }

  /*
   * Chronological order.
   */

  upcoming.sort(
    (
      a,
      b
    ) =>
      DateTime.fromISO(
        a.startsAt
      ).toMillis() -
      DateTime.fromISO(
        b.startsAt
      ).toMillis()
  );

  /*
   * Remove accidental duplicates.
   */

  const seen =
    new Set<string>();

  return upcoming.filter(
    (
      meeting
    ) => {
      const key =
        `${meeting.sourceUrl}|${meeting.startsAt}`;

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}