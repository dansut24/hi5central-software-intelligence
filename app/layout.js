export const metadata = {
  title: "Hi5Central Software Intelligence",
  description: "Vendor-direct software release intelligence",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}