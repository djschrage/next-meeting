"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type Meeting = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  weekday: string | null;
  startTime: string | null;
  endTime: string | null;
  timezoneText: string | null;
  timezone: string;
  zoomId: string | null;
  password: string | null;
  zoomUrl: string | null;
  sourceUrl: string;
  startsAt: string;
  endsAt: string | null;
};

type ApiResponse = {
  success: boolean;
  generatedAt?: string;
  mode?: "rolling" | "date";
  windowHours?: number;
  date?: string;
  timezone?: string;
  count?: number;
  meetings?: Meeting[];
  error?: string;
};

type DateOption = {
  key: string;
  label: string;
  date: string | null;
};

function localDateString(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildDateOptions(): DateOption[] {
  const options: DateOption[] = [
    {
      key: "next-12",
      label: "Next 12 hours",
      date: null,
    },
  ];

  const today = new Date();

  for (let i = 0; i < 8; i++) {
    const date = new Date(
      today
    );

    date.setDate(
      today.getDate() + i
    );

    let label: string;

    if (i === 0) {
      label = "Today";
    } else if (i === 1) {
      label = "Tomorrow";
    } else {
      label =
        new Intl.DateTimeFormat(
          undefined,
          {
            weekday: "short",
            month: "short",
            day: "numeric",
          }
        ).format(date);
    }

    options.push({
      key: localDateString(date),
      label,
      date: localDateString(date),
    });
  }

  return options;
}

function formatMeetingTime(
  iso: string
) {
  return new Intl.DateTimeFormat(
    undefined,
    {
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(
    new Date(iso)
  );
}

function formatDay(
  iso: string
) {
  const date = new Date(iso);

  const today = new Date();

  const tomorrow = new Date();

  tomorrow.setDate(
    today.getDate() + 1
  );

  if (
    date.toDateString() ===
    today.toDateString()
  ) {
    return "Today";
  }

  if (
    date.toDateString() ===
    tomorrow.toDateString()
  ) {
    return "Tomorrow";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      weekday: "long",
      month: "short",
      day: "numeric",
    }
  ).format(date);
}

function getRelativeTime(
  iso: string,
  now: number
) {
  const start =
    new Date(iso).getTime();

  const diffMs =
    start - now;

  const minutes =
    Math.round(
      diffMs / 60000
    );

  if (minutes <= 0) {
    return "Starting now";
  }

  if (minutes === 1) {
    return "Starts in 1 min";
  }

  if (minutes < 60) {
    return `Starts in ${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const remainingMinutes =
    minutes % 60;

  if (
    remainingMinutes === 0
  ) {
    return `Starts in ${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    }`;
  }

  return `Starts in ${hours}h ${remainingMinutes}m`;
}

function formatZoomId(
  zoomId: string
) {
  if (zoomId.length === 11) {
    return `${zoomId.slice(
      0,
      3
    )} ${zoomId.slice(
      3,
      7
    )} ${zoomId.slice(7)}`;
  }

  if (zoomId.length === 10) {
    return `${zoomId.slice(
      0,
      3
    )} ${zoomId.slice(
      3,
      6
    )} ${zoomId.slice(6)}`;
  }

  return zoomId;
}

function displayLocation(
  meeting: Meeting
) {
  if (
    meeting.city &&
    meeting.state
  ) {
    return `${meeting.city}, ${meeting.state}`;
  }

  if (meeting.state) {
    return meeting.state;
  }

  return (
    meeting.location ??
    "Online meeting"
  );
}

function hasEmbeddedPassword(
  zoomUrl: string | null
) {
  if (!zoomUrl) {
    return false;
  }

  return (
    zoomUrl.includes("pwd=") ||
    zoomUrl.includes(
      "passcode="
    )
  );
}

export default function Home() {
  const [meetings, setMeetings] =
    useState<Meeting[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null
    );

  const [now, setNow] =
    useState(Date.now());

  const [copied, setCopied] =
    useState<string | null>(
      null
    );

  const [
    selectedOption,
    setSelectedOption,
  ] = useState("next-12");

  const dateOptions =
    useMemo(
      () =>
        buildDateOptions(),
      []
    );

  const localTimezone =
    useMemo(() => {
      try {
        return Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone;
      } catch {
        return "UTC";
      }
    }, []);

  const activeOption =
    dateOptions.find(
      (option) =>
        option.key ===
        selectedOption
    ) ?? dateOptions[0];

  async function loadMeetings(
    option: DateOption
  ) {
    try {
      setLoading(true);
      setError(null);

      let url =
        "/api/meetings?hours=12";

      if (option.date) {
        const params =
          new URLSearchParams({
            date: option.date,
            timezone:
              localTimezone,
          });

        url =
          `/api/meetings?${params.toString()}`;
      }

      const response =
        await fetch(url);

      const data: ApiResponse =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ??
            "Unable to load meetings."
        );
      }

      setMeetings(
        data.meetings ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load meetings."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const option =
      dateOptions.find(
        (item) =>
          item.key ===
          selectedOption
      );

    if (option) {
      loadMeetings(option);
    }
  }, [
    selectedOption,
    dateOptions,
    localTimezone,
  ]);

  useEffect(() => {
    const interval =
      window.setInterval(
        () =>
          setNow(
            Date.now()
          ),
        30000
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, []);

  async function copyText(
    value: string,
    key: string
  ) {
    try {
      await navigator.clipboard.writeText(
        value
      );

      setCopied(key);

      window.setTimeout(
        () =>
          setCopied(null),
        1500
      );
    } catch {
      // Clipboard may be
      // unavailable in some browsers.
    }
  }

  const rollingMode =
    selectedOption ===
    "next-12";

  let previousDay = "";

  return (
    <main className="page-shell">
      <section className="hero">
        <nav className="brand">
          <div>
            <div className="brand-name">
              NEXT MEETING
            </div>

            <div className="brand-subtitle">
              GAMBLERS ANONYMOUS
            </div>
          </div>
        </nav>

        <div className="hero-content">
          <div className="eyebrow">
            ONLINE MEETINGS
          </div>

          <h1>
            Find a meeting
            <br />
            when you need one.
          </h1>

          <p className="hero-copy">
            Virtual Gamblers
            Anonymous meetings,
            organized around your
            local time.
          </p>

          <div className="local-time-note">
            <span className="status-dot" />

            <span>
              Times shown in your
              local timezone
              {localTimezone
                ? ` · ${localTimezone}`
                : ""}
            </span>
          </div>
        </div>

        <div className="hero-accent" />
      </section>

      <section className="meetings-section">
        <div className="schedule-toolbar">
          <div className="schedule-heading">
            <div className="section-kicker">
              {rollingMode
                ? "NEXT 12 HOURS"
                : "MEETING SCHEDULE"}
            </div>

            <h2>
              {rollingMode
                ? "Upcoming meetings"
                : activeOption.label}
            </h2>
          </div>

          {!loading &&
            !error && (
              <div className="meeting-count">
                {meetings.length}{" "}
                {meetings.length ===
                1
                  ? "meeting"
                  : "meetings"}
              </div>
            )}
        </div>

        <div className="date-selector-wrap">
          <div className="date-selector">
            {dateOptions.map(
              (option) => (
                <button
                  key={
                    option.key
                  }
                  type="button"
                  className={
                    selectedOption ===
                    option.key
                      ? "date-option date-option-active"
                      : "date-option"
                  }
                  onClick={() =>
                    setSelectedOption(
                      option.key
                    )
                  }
                >
                  {option.label}
                </button>
              )
            )}
          </div>
        </div>

        {loading && (
          <div className="state-card">
            <div className="loader" />

            <div>
              <strong>
                Finding meetings…
              </strong>

              <p>
                Checking the
                schedule.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="state-card error-card">
            <div>
              <strong>
                We couldn't load the
                meetings.
              </strong>

              <p>{error}</p>
            </div>

            <button
              onClick={() =>
                loadMeetings(
                  activeOption
                )
              }
            >
              Try again
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          meetings.length ===
            0 && (
            <div className="state-card">
              <div>
                <strong>
                  No meetings found
                  for this period.
                </strong>

                <p>
                  Try another day or
                  check the next
                  12 hours.
                </p>
              </div>
            </div>
          )}

        {!loading &&
          !error && (
            <div className="meeting-list">
              {meetings.map(
                (
                  meeting,
                  index
                ) => {
                  const day =
                    formatDay(
                      meeting.startsAt
                    );

                  const showDay =
                    day !==
                    previousDay;

                  previousDay =
                    day;

                  const relative =
                    getRelativeTime(
                      meeting.startsAt,
                      now
                    );

                  const diff =
                    new Date(
                      meeting.startsAt
                    ).getTime() -
                    now;

                  const urgent =
                    diff >= 0 &&
                    diff <=
                      30 *
                        60 *
                        1000;

                  const embeddedPassword =
                    hasEmbeddedPassword(
                      meeting.zoomUrl
                    );

                  return (
                    <div
                      key={`${meeting.sourceUrl}-${meeting.startsAt}`}
                    >
                      {showDay && (
                        <div className="day-divider">
                          <span>
                            {day}
                          </span>

                          <div />
                        </div>
                      )}

                      <article
                        className={
                          urgent
                            ? "meeting-card meeting-card-urgent"
                            : "meeting-card"
                        }
                      >
                        <div className="meeting-time-column">
                          <div className="meeting-time">
                            {formatMeetingTime(
                              meeting.startsAt
                            )}
                          </div>

                          {rollingMode && (
                            <div
                              className={
                                urgent
                                  ? "relative-time relative-time-urgent"
                                  : "relative-time"
                              }
                            >
                              {
                                relative
                              }
                            </div>
                          )}
                        </div>

                        <div className="meeting-main">
                          <div className="meeting-heading">
                            <div>
                              <h3>
                                {displayLocation(
                                  meeting
                                )}
                              </h3>

                              <p>
                                Online
                                Gamblers
                                Anonymous
                                meeting
                              </p>
                            </div>

                            {meeting.zoomUrl && (
                              <a
                                className="join-button desktop-join"
                                href={
                                  meeting.zoomUrl
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Join
                                meeting
                                <span>
                                  ↗
                                </span>
                              </a>
                            )}
                          </div>

                          {(meeting.zoomId ||
                            meeting.password) && (
                            <div className="credentials">
                              {meeting.zoomId && (
                                <div className="credential">
                                  <div className="credential-label">
                                    Meeting
                                    ID
                                  </div>

                                  <div className="credential-value">
                                    {formatZoomId(
                                      meeting.zoomId
                                    )}
                                  </div>

                                  <button
                                    className="copy-button"
                                    onClick={() =>
                                      copyText(
                                        meeting.zoomId!,
                                        `id-${index}`
                                      )
                                    }
                                  >
                                    {copied ===
                                    `id-${index}`
                                      ? "Copied"
                                      : "Copy"}
                                  </button>
                                </div>
                              )}

                              {meeting.password && (
                                <div className="credential">
                                  <div className="credential-label">
                                    Passcode
                                  </div>

                                  <div className="credential-value">
                                    {
                                      meeting.password
                                    }
                                  </div>

                                  <button
                                    className="copy-button"
                                    onClick={() =>
                                      copyText(
                                        meeting.password!,
                                        `password-${index}`
                                      )
                                    }
                                  >
                                    {copied ===
                                    `password-${index}`
                                      ? "Copied"
                                      : "Copy"}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {meeting.zoomUrl && (
                            <a
                              className="join-button mobile-join"
                              href={
                                meeting.zoomUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Join meeting
                              <span>
                                ↗
                              </span>
                            </a>
                          )}

                          {meeting.password &&
                            meeting.zoomUrl &&
                            !embeddedPassword && (
                              <div className="passcode-hint">
                                You may
                                need the
                                passcode
                                above
                                after
                                opening
                                Zoom.
                              </div>
                            )}

                          <div className="meeting-footer">
                            <a
                              href={
                                meeting.sourceUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                              original
                              GA listing
                              ↗
                            </a>
                          </div>
                        </div>
                      </article>
                    </div>
                  );
                }
              )}
            </div>
          )}

        <footer>
          <div className="footer-mark">
            NEXT MEETING
          </div>

          <p>
            Meeting information
            comes from public
            Gamblers Anonymous
            listings. Verify details
            with the original
            listing when needed.
          </p>
        </footer>
      </section>
    </main>
  );
}