import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getUpcomingMeetings,
} from "../../../lib/meetings";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: NextRequest
) {
  try {
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

    /*
     * Keep the API bounded even if somebody manually
     * requests a giant window.
     */
    hours = Math.min(hours, 24);

    const meetings =
      await getUpcomingMeetings(
        hours
      );

    return NextResponse.json({
      success: true,
      generatedAt:
        new Date().toISOString(),
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