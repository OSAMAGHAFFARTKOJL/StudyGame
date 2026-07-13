import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyRealm",
  description: "Turn academic PDFs into story quests, bubble quizzes, and rank-based learning."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
