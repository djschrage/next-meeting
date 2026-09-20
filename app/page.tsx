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
  windowHours?: number;
  count?: number;
  meetings?: Meeting[];
  error?: string;
};

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
  const date =
    new Date(iso);

  const today =
    new Date();

  const tomorrow =
    new Date();

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
  if (
    zoomId.length === 11
  ) {
    return `${zoomId.slice(
      0,
      3
    )} ${zoomId.slice(
      3,
      7
    )} ${zoomId.slice(7)}`;
  }

  if (
    zoomId.length === 10
  ) {
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
    zoomUrl.includes(
      "pwd="
    ) ||
    zoomUrl.includes(
      "passcode="
    )
  );
}

export default function Home() {
  const [
    meetings,
    setMeetings,
  ] = useState<Meeting[]>(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    now,
    setNow,
  ] = useState(
    Date.now()
  );

  const [
    copied,
    setCopied,
  ] = useState<
    string | null
  >(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const response =
          await fetch(
            "/api/meetings?hours=12"
          );

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

    load();
  }, []);

  useEffect(() => {
    const interval =
      window.setInterval(
        () => {
          setNow(
            Date.now()
          );
        },
        30000
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, []);

  const localTimezone =
    useMemo(() => {
      try {
        return Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone;
      } catch {
        return null;
      }
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
        () => {
          setCopied(null);
        },
        1500
      );
    } catch {
      // Clipboard may be blocked.
    }
  }

  let previousDay =
    "";

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="brand">
          <div className="brand-mark">
            12
          </div>

          <div>
            <div className="brand-name">
              Next Meeting
            </div>

            <div className="brand-subtitle">
              Gamblers Anonymous
            </div>
          </div>
        </div>

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
            Anonymous meetings
            starting in the next
            12 hours.
          </p>

          <div className="local-time-note">
            <span className="status-dot" />

            Times shown in your
            local timezone
            {localTimezone
              ? ` · ${localTimezone}`
              : ""}
          </div>
        </div>
      </section>

      <section className="meetings-section">
        <div className="section-header">
          <div>
            <div className="section-kicker">
              NEXT 12 HOURS
            </div>

            <h2>
              Upcoming meetings
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

        {loading && (
          <div className="state-card">
            <div className="loader" />

            <div>
              <strong>
                Finding meetings…
              </strong>

              <p>
                Checking the
                upcoming schedule.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="state-card error-card">
            <div>
              <strong>
                We couldn't load
                the meetings.
              </strong>

              <p>
                {error}
              </p>
            </div>

            <button
              onClick={() =>
                window.location.reload()
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
                  in the next 12
                  hours.
                </strong>

                <p>
                  Check again soon
                  as the schedule
                  changes
                  throughout the
                  day.
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

                  const urgent =
                    new Date(
                      meeting.startsAt
                    ).getTime() -
                      now <=
                    30 * 60 * 1000;

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
                        className={`meeting-card ${
                          urgent
                            ? "meeting-card-urgent"
                            : ""
                        }`}
                      >
                        <div className="meeting-time-column">
                          <div className="meeting-time">
                            {formatMeetingTime(
                              meeting.startsAt
                            )}
                          </div>

                          <div
                            className={`relative-time ${
                              urgent
                                ? "relative-time-urgent"
                                : ""
                            }`}
                          >
                            {
                              relative
                            }
                          </div>
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
                                Join meeting
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
          <p>
            Meeting information
            comes from public
            Gamblers Anonymous
            listings. Verify
            details with the
            original listing when
            needed.
          </p>
        </footer>
      </section>
    </main>
  );
}