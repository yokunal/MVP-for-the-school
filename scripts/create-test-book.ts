import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const p = new PrismaClient();
  try {
    const admin = await p.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) {
      console.error("No admin found");
      return;
    }
    const book = await p.book.create({
      data: {
        title: "Test Book",
        author: "Test Author",
        subject: "Testing",
        synopsis: "A test book for verifying the PDF reader.",
        library: "GENERAL",
        pdfKey: "books/pdf/test_doc.pdf",
        uploadedById: admin.id,
      },
    });
    console.log("Book created:", book.id);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await p.$disconnect();
  }
}

main();
