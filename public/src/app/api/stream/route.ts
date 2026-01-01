import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI();

export const runtime = 'nodejs' // "edge";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const image = formData.get("image") as File | null;
  const modifier = formData.get("modifier") as string | null;
  if (!image || !modifier) {
    return NextResponse.json({ error: "Image and modifier are required" }, { status: 400 });
  }
  // Modifier-to-prompt mapping (mirrored from generate/route.ts)
  const modifierPrompts: Record<string, string> = {
    "ghibli-style": "Render the cake and subjects in a Studio Ghibli–inspired scene: soft, hand-painted colours, warm filmic light, rolling hills or a cozy bakery in the background, and whimsical tiny magical details (floating sugar motes, pastry sprites). Keep the cake composition faithful to the photo and show edible textures (buttercream brushstrokes, glossy glaze).",
    "paperback": "Design a dramatic vintage cookbook or paperback recipe cover (1980s speculative kitchen fiction). Show the cake as the central illustrated subject with cinematic lighting and retro halftone textures. Title in bold serif at the top: \"The Cake Maker\". Add playful back-cover blurbs about secret recipes and a retro palette (deep blues, warm ochres). Make the cover look slightly worn and tactile.",
    "action-figure": "Create a boxed collectible cake topper set inspired by retro toy packaging. Render the subjects as stylised miniature figurine toppers inside a clear blister pack attached to a branded cake board. Include accessory compartments (spatula, piping bag), retro typography that reads \"CAKE HOUR\", and slightly distressed cardboard textures.",
    "lego-minifigure-style": "Render the subjects and the cake as Lego-style minifigures and a blocky tiered cake with glossy plastic sheen. Keep bright primary colours and visible stud details on the cake tiers. Place them in a miniature San Francisco-inspired Lego diorama for a playful scene.",
    "japanese-anime-movie-poster": "Design a cinematic Japanese anime poster for a fictional bakery film. Show the subject as a heroic pastry chef and the cake as a dramatic focal point. Use hand-painted cel shading, starburst gradients, and a retro palette (indigo, vermilion, mustard). Add small production credits along the bottom and subtle paper wear.",
    "80s-cave": "Create a nostalgic 1980s bakery editorial portrait: neon signage, VHS grain, retro-futurist chef jacket, and a throne built of stacked cake boxes. Emphasise moody handheld flash, blown highlights, and a slightly lo-fi editorial finish.",
    "mission-patch": "Design a stitched mission patch-inspired cake topper: circular embroidered badge with the cake and chef caricatures in the center, merrowed edge, metallic thread highlights, and the rim text: \"Cake Maker 2025 • San Francisco\". Render visible thread texture and stitch direction.",
    "knitted-cozy-scene": "Render the cake and subjects as chunky knitted soft toys arranged on a plush armchair beside a warm fireplace. Emphasise wool fibres, cable-knit textures, and a tactile soft-light atmosphere — make the cake look like a crafted plush prop.",
    "comic-panel": "Create a single-page comic of 4–6 panels telling a short, self-contained story about receiving an invitation to a cake-making event, traveling to a San Francisco bake-off, seeing a demo, and celebrating over slices. Keep dialogue concise and visually clear; use the subjects and the cake as the narrative focus.",
    "inside-cake-flavors": "Generate a detailed cross-section illustration of the cake showing interior layers and fillings. Render labelled flavor layers (e.g., vanilla sponge, chocolate ganache, raspberry jam, lemon curd, matcha mousse) with realistic textures. Also include a small interactive-style overlay or legend that visually highlights selectable flavor options and quantities, as if the user can toggle layers. Maintain overall composition and make labels legible at thumbnail scale.",
  };
  const arrayBuffer = await image.arrayBuffer();
  //const base64 = Buffer.from(arrayBuffer).toString("base64");
 
  function base64FromArrayBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return globalThis.btoa(binary);
}

const base64 = base64FromArrayBuffer(arrayBuffer);
 
  const dataUrl = `data:${image.type};base64,${base64}`;
  const mappedPrompt = modifierPrompts[modifier]
  ? `${modifierPrompts[modifier]}. Maintain the original composition and subject.`
  : `Generate an image of the subject with the following modifier: ${modifier}. Maintain the original composition and subject.`;

  
  // Use mapped prompt if available, otherwise fallback to generic
 // const mappedPrompt = modifierPrompts[modifier] 
  //  ? `${modifierPrompts[modifier]}. Maintain the original composition and subject.`
   // : `Generate an image of the subject with the following modifier: ${mappedPrompt}. Maintain the original composition and subject.`;
  console.log('Generating with modifier:', modifier, 'Prompt:', mappedPrompt);

  const prompt = mappedPrompt;
  const openaiStream = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
    tools: [
      {
        type: "image_generation",
        partial_images: 3,
        size: "1024x1024",
        quality: "high",
        moderation: "low",
      },
    ],
    stream: true, 
    tool_choice: 'required',
  });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  /*(async () => {
    for await (const event of openaiStream) {
      if (typeof event !== "object" || !event.type) continue;
      if (event.type === "response.image_generation_call.partial_image") {
        const partialId = ((event as any).item_id || (event as any).id);
        console.log('stream partial image', partialId);
        const url = `data:image/png;base64,${(event as any).partial_image_b64}`;
        await writer.write(JSON.stringify({ type: "partial", url }) + "\n");
      } else if (event.type === "response.image_generation_call.completed") {
        const id = ((event as any).item_id || (event as any).id);
        console.log('stream final image with id:', id);
        await writer.write(
          JSON.stringify({ type: "final", id }) + "\n",
        );
      } else {
        console.log('Received event type:', event.type);
      }
    }
    await writer.close();
  })();*/

  (async () => {
  try {
    for await (const event of openaiStream) {
      if (typeof event !== "object" || !event.type) continue;

      if (event.type === "response.image_generation_call.partial_image") {
        const partialId = (event as any).item_id || (event as any).id;
        console.log("stream partial image", partialId);

        const url = `data:image/png;base64,${(event as any).partial_image_b64}`;
        await writer.write(JSON.stringify({ type: "partial", url }) + "\n");

      } else if (event.type === "response.image_generation_call.completed") {
        const id = (event as any).item_id || (event as any).id;
        console.log("stream final image with id:", id);

        await writer.write(JSON.stringify({ type: "final", id }) + "\n");
      }
    }

    await writer.close();
  } catch (err) {
    console.error("OpenAI stream error:", err);
    try {
      await writer.abort(err as any);
    } catch {}
  }
})();

return new NextResponse(readable, {
  headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
});


  /*return new NextResponse(readable, {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
  });*/
}

