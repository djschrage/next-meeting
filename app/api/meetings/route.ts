import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getMeetingsForLocalDate,
  getUpcomingMeetings,
} from "../../../lib/meetings";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: NextRequest
) {
  try {
    const date =
      request.nextUrl.searchParams.get(
        "date"
      );

    const timezone =
      request.nextUrl.searchParams.get(
        "timezone"
      );

    /*
     * DATE MODE
     *
     * Example:
     * /api/meetings?date=2026-09-20&timezone=America/New_York
     */
    if (date) {
      const datePattern =
        /^\d{4}-\d{2}-\d{2}$/;

      if (!datePattern.test(date)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid date. Expected YYYY-MM-DD.",
          },
          {
            status: 400,
          }
        );
      }

      const meetings =
        await getMeetingsForLocalDate(
          date,
          timezone || "UTC"
        );

      return NextResponse.json({
        success: true,
        generatedAt:
          new Date().toISOString(),
        mode: "date",
        date,
        timezone:
          timezone || "UTC",
        datasetMeetings: 239,
        count: meetings.length,
        meetings,
      });
    }

    /*
     * ROLLING WINDOW MODE
     *
     * Default:
     * /api/meetings?hours=12
     */
    const hoursParam =
      request.nextUrl.searchParams.get(
        "hours"
      );

    let hours = Number(
      hoursParam ?? 12
    );

    if (
      !Number.isFinite(hours) ||
      hours <= 0
    ) {
      hours = 12;
    }

    hours = Math.min(
      hours,
      24
    );

    const meetings =
      await getUpcomingMeetings(
        hours
      );

    return NextResponse.json({
      success: true,
      generatedAt:
        new Date().toISOString(),
      mode: "rolling",
      windowHours: hours,
      datasetMeetings: 239,
      count: meetings.length,
      meetings,
    });
  } catch (error) {
    console.error(
      "Meeting API failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}