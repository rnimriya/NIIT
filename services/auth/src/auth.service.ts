import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { users, profiles, type Database, type User } from "@neet/db";
import { signDevToken } from "@neet/shared";
import { config } from "./config";
import { DB } from "./db.module";

@Injectable()
export class AuthService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async register(email: string, fullName?: string): Promise<{ user: User; token: string }> {
    const existing = await this.findByEmail(email);
    const user =
      existing ??
      (await this.db.transaction(async (tx) => {
        const [u] = await tx.insert(users).values({ email }).returning();
        await tx.insert(profiles).values({ userId: u.id, fullName: fullName ?? null });
        return u;
      }));
    return { user, token: this.token(user) };
  }

  async login(email: string): Promise<{ user: User; token: string } | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;
    return { user, token: this.token(user) };
  }

  async findById(id: string): Promise<User | undefined> {
    const [u] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return u;
  }

  private async findByEmail(email: string): Promise<User | undefined> {
    const [u] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return u;
  }

  private token(user: User): string {
    return signDevToken(
      { sub: user.id, email: user.email, role: user.role },
      config.JWT_DEV_SECRET,
    );
  }
}
