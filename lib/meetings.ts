import { DateTime } from "luxon";
import meetingData from "../data/ga-meetings.json";
import { getMeetingTimezone } from "./timezones";

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

export type UpcomingMeeting = GAMeeting & {
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

const STATIC_MEETINGS =
  meetingData.meetings as GAMeeting[];

function weekdayName(date: DateTime) {
  return WEEKDAYS[date.weekday - 1];
}

function parseTime(time: string) {
  const match = time.match(
    /^(\d{1,2}):(\d{2})\s*([AP]M)$/i
  );

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hour !== 12) {
    hour += 12;
  }

  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return {
    hour,
    minute,
  };
}

function getMeetingEnd(
  meeting: GAMeeting,
  start: DateTime
) {
  if (!meeting.endTime) {
    return null;
  }

  const parsed = parseTime(
    meeting.endTime
  );

  if (!parsed) {
    return null;
  }

  let end = DateTime.fromObject(
    {
      year: start.year,
      month: start.month,
      day: start.day,
      hour: parsed.hour,
      minute: parsed.minute,
    },
    {
      zone: start.zoneName ?? "UTC",
    }
  );

  if (end < start) {
    end = end.plus({ days: 1 });
  }

  return end;
}

function buildOccurrence(
  meeting: GAMeeting,
  timezone: string,
  localDate: DateTime
): UpcomingMeeting | null {
  if (
    !meeting.startTime ||
    !meeting.weekday
  ) {
    return null;
  }

  if (
    weekdayName(localDate).toLowerCase() !==
    meeting.weekday.toLowerCase()
  ) {
    return null;
  }

  const parsed = parseTime(
    meeting.startTime
  );

  if (!parsed) {
    return null;
  }

  const start = DateTime.fromObject(
    {
      year: localDate.year,
      month: localDate.month,
      day: localDate.day,
      hour: parsed.hour,
      minute: parsed.minute,
    },
    {
      zone: timezone,
    }
  );

  if (!start.isValid) {
    return null;
  }

  const end = getMeetingEnd(
    meeting,
    start
  );

  return {
    ...meeting,
    timezone,
    startsAt: start.toUTC().toISO()!,
    endsAt: end
      ? end.toUTC().toISO()
      : null,
  };
}

function getMeetingsInWindow(
  windowStart: DateTime,
  windowEnd: DateTime
) {
  const meetings: UpcomingMeeting[] = [];

  for (const meeting of STATIC_MEETINGS) {
    if (
      !meeting.weekday ||
      !meeting.startTime
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

    /*
     * Convert the edges of the requested UTC window
     * into the meeting's own timezone. Then inspect
     * the surrounding local dates.
     *
     * This handles visitors and meetings being in
     * different timezones, including date boundaries.
     */
    const localWindowStart =
      windowStart.setZone(timezone);

    const localWindowEnd =
      windowEnd.setZone(timezone);

    const firstDate =
      localWindowStart
        .startOf("day")
        .minus({ days: 1 });

    const lastDate =
      localWindowEnd
        .startOf("day")
        .plus({ days: 1 });

    let date = firstDate;

    while (date <= lastDate) {
      const occurrence =
        buildOccurrence(
          meeting,
          timezone,
          date
        );

      if (occurrence) {
        const startsAt =
          DateTime.fromISO(
            occurrence.startsAt
          );

        /*
         * Start inclusive, end exclusive.
         */
        if (
          startsAt >= windowStart &&
          startsAt < windowEnd
        ) {
          meetings.push(
            occurrence
          );
        }
      }

      date = date.plus({ days: 1 });
    }
  }

  meetings.sort(
    (a, b) =>
      DateTime.fromISO(
        a.startsAt
      ).toMillis() -
      DateTime.fromISO(
        b.startsAt
      ).toMillis()
  );

  const seen = new Set<string>();

  return meetings.filter(
    (meeting) => {
      const key =
        `${meeting.sourceUrl}|${meeting.startsAt}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}

export async function getUpcomingMeetings(
  hours = 12
): Promise<UpcomingMeeting[]> {
  const now = DateTime.utc();

  return getMeetingsInWindow(
    now,
    now.plus({ hours })
  );
}

export async function getMeetingsForLocalDate(
  date: string,
  visitorTimezone: string
): Promise<UpcomingMeeting[]> {
  let localStart =
    DateTime.fromISO(date, {
      zone: visitorTimezone,
    }).startOf("day");

  /*
   * Invalid/made-up browser timezone:
   * safely fall back to UTC.
   */
  if (!localStart.isValid) {
    localStart =
      DateTime.fromISO(date, {
        zone: "UTC",
      }).startOf("day");
  }

  const localEnd =
    localStart.plus({ days: 1 });

  return getMeetingsInWindow(
    localStart.toUTC(),
    localEnd.toUTC()
  );
}