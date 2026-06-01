import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { sql } from "@vercel/postgres";

async function getOrCreateUser(googleId, email, name, image) {
  // Check if user exists
  const { rows } = await sql`
    SELECT * FROM users WHERE google_id = ${googleId}
  `;
  if (rows.length > 0) {
    // Update last seen
    await sql`UPDATE users SET last_seen = NOW() WHERE google_id = ${googleId}`;
    return rows[0];
  }
  // Create new user (pending approval)
  const { rows: newRows } = await sql`
    INSERT INTO users (google_id, email, name, image, approved, created_at, last_seen)
    VALUES (${googleId}, ${email}, ${name}, ${image || ""}, false, NOW(), NOW())
    RETURNING *
  `;
  return newRows[0];
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      try {
        const dbUser = await getOrCreateUser(
          account.providerAccountId,
          user.email,
          user.name,
          user.image
        );
        return true; // Always allow sign in, we check approval in session
      } catch (e) {
        console.error("SignIn error:", e);
        return false;
      }
    },
    async session({ session, token }) {
      try {
        const { rows } = await sql`
          SELECT * FROM users WHERE google_id = ${token.sub}
        `;
        if (rows.length > 0) {
          session.user.id = rows[0].id;
          session.user.googleId = rows[0].google_id;
          session.user.approved = rows[0].approved;
          session.user.dbName = rows[0].name;
        }
      } catch (e) {
        console.error("Session error:", e);
      }
      return session;
    },
    async jwt({ token }) {
      return token;
    },
  },
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
