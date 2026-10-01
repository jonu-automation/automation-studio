import { pgTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ssoConfigsTable = pgTable("sso_configs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),

  provider: varchar("provider", { length: 20 }).notNull().default("saml"),

  entityId: text("entity_id"),
  acsUrl: text("acs_url"),
  x509Certificate: text("x509_certificate"),
  metadataUrl: text("metadata_url"),

  oidcClientId: text("oidc_client_id"),
  oidcClientSecret: text("oidc_client_secret"),
  oidcIssuerUrl: text("oidc_issuer_url"),

  enabled: boolean("enabled").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
