import { WebhookEvent } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs";
import { PrismaClient, User_role } from "@prisma/client";
import { headers } from "next/headers";
import { Webhook } from "svix";

export async function POST(request: Request) {
  const prisma = new PrismaClient();
  const payload: WebhookEvent = await request.json();
  const body = JSON.stringify(payload);

  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  // is the user on localhost?
  const is_localhost = request.headers.get("origin")?.includes("localhost");

  if (payload.type === "user.created") {
    const userData = payload.data;

    try {
      // 1️⃣ determine the user's org
      const user_org_from_email = userData.email_addresses[0].email_address
        .split("@")[1]
        .split(".")[0];

      // if org exists in CLERK: assign user to org.
      // first search for the org in clerk...
      const orgs = await clerkClient.organizations.getOrganizationList();
      const org_search = orgs.find(
        (org) => org.name.toLowerCase() === user_org_from_email
      );

      // then join the user to the org...
      if (org_search) {
        // assign user to org
        await clerkClient.organizations.createOrganizationMembership({
          organizationId: org_search.id,
          userId: userData.id,
          role: "team_member",
        });
      }
      // do the same through prisma...
      // Create a new user through prisma...
      await prisma.user.create({
        data: {
          clerkId: userData.id,
          email: userData.email_addresses[0].email_address,
          first_name: userData.first_name,
          last_name: userData.last_name,
          role: "TEAM_MEMBER",
          organisationId: org_search?.id ? org_search?.id : null,
          dev_or_prod: is_localhost ? "dev" : "prod",
        },
      });

      return new Response(
        JSON.stringify({ message: "User created successfully" }),
        { status: 200 }
      );
    } catch (error) {
      console.error("Error creating user:", error);
      return new Response(JSON.stringify({ message: "Error creating user" }), {
        status: 500,
      });
    }
  } else {
    return new Response(JSON.stringify({ message: "Webhook event ignored" }), {
      status: 200,
    });
  }
}
