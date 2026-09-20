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

  if (!match) {
    return null;
  }

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

function getRelevantWeekdays(
  now: DateTime,
  cutoff: DateTime
) {
  /*
   * The dataset contains meetings across multiple
   * US time zones.
   *
   * A 12-hour UTC window can cross different local
   * calendar days depending on the meeting's zone.
   */
  const zones = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "Pacific/Honolulu",
  ];

  const weekdays = new Set<string>();

  for (const zone of zones) {
    weekdays.add(
      weekdayName(now.setZone(zone))
    );

    weekdays.add(
      weekdayName(cutoff.setZone(zone))
    );
  }

  return weekdays;
}

function getMeetingStart(
  meeting: GAMeeting,
  timezone: string,
  now: DateTime,
  cutoff: DateTime
) {
  if (
    !meeting.startTime ||
    !meeting.weekday
  ) {
    return null;
  }

  const parsed = parseTime(
    meeting.startTime
  );

  if (!parsed) {
    return null;
  }

  const localNow = now.setZone(timezone);

  /*
   * Look slightly behind/ahead of the current local
   * date so midnight and cross-time-zone cases work
   * correctly.
   */
  for (
    let offset = -1;
    offset <= 2;
    offset++
  ) {
    const candidateDate =
      localNow.plus({ days: offset });

    if (
      weekdayName(candidateDate)
        .toLowerCase() !==
      meeting.weekday.toLowerCase()
    ) {
      continue;
    }

    const candidate =
      DateTime.fromObject(
        {
          year: candidateDate.year,
          month: candidateDate.month,
          day: candidateDate.day,
          hour: parsed.hour,
          minute: parsed.minute,
        },
        {
          zone: timezone,
        }
      );

    if (!candidate.isValid) {
      continue;
    }

    const candidateUtc =
      candidate.toUTC();

    if (
      candidateUtc >= now &&
      candidateUtc <= cutoff
    ) {
      return candidate;
    }
  }

  return null;
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
      zone: start.zoneName,
    }
  );

  /*
   * Handles a meeting such as:
   *
   * 11:30 PM - 12:30 AM
   */
  if (end < start) {
    end = end.plus({ days: 1 });
  }

  return end;
}

export async function getUpcomingMeetings(
  hours = 12
): Promise<UpcomingMeeting[]> {
  const now = DateTime.utc();
  const cutoff = now.plus({ hours });

  const relevantWeekdays =
    getRelevantWeekdays(
      now,
      cutoff
    );

  const upcoming: UpcomingMeeting[] =
    [];

  for (const meeting of STATIC_MEETINGS) {
    if (
      !meeting.weekday ||
      !meeting.startTime
    ) {
      continue;
    }

    if (
      !relevantWeekdays.has(
        meeting.weekday
      )
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

    const start =
      getMeetingStart(
        meeting,
        timezone,
        now,
        cutoff
      );

    if (!start) {
      continue;
    }

    const end =
      getMeetingEnd(
        meeting,
        start
      );

    upcoming.push({
      ...meeting,
      timezone,
      startsAt:
        start.toUTC().toISO()!,
      endsAt: end
        ? end.toUTC().toISO()
        : null,
    });
  }

  upcoming.sort(
    (a, b) =>
      DateTime.fromISO(
        a.startsAt
      ).toMillis() -
      DateTime.fromISO(
        b.startsAt
      ).toMillis()
  );

  /*
   * sourceUrl + start time represents a particular
   * occurrence of a particular GA listing.
   *
   * Do not dedupe by Zoom ID because separate GA
   * listings can legitimately share a Zoom meeting.
   */
  const seen = new Set<string>();

  return upcoming.filter(
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