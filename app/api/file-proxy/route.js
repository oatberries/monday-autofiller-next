
export async function GET(req) {
  try {
    //Get the ?u=... query param
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("u");

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Missing ?u=" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    //Fetch the remote file
    const r = await fetch(url);
    if (!r.ok) {
      return new Response(null, { status: r.status });
    }

    const ab = await r.arrayBuffer();

    //Return it as a DOCX blob
    return new Response(ab, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
