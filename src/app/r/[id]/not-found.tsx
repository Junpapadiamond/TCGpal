import Image from "next/image";
import Link from "next/link";

export default function ReceiptUnavailable() {
  return <main className="grid min-h-screen place-items-center bg-[#f4f7f3] p-6 text-[#24312f]">
    <section className="w-full max-w-xl rounded-xl border border-[#c9d7ce] bg-[#fcfbf6] p-7 text-center shadow-[0_5px_16px_rgba(36,49,47,0.08)] sm:p-10">
      <Image src="/lens-logo-horizontal.svg" alt="TCGlens" width={126} height={36} className="mx-auto mb-8" />
      <h1 className="font-serif text-2xl">This comparison needs a fresh search</h1>
      <p className="mt-4 text-sm leading-6 text-[#64736c]">The saved result has expired, is unavailable, or uses older comparison rules.</p>
      <Link className="primary-button mt-6" href="/">Start a new search</Link>
    </section>
  </main>;
}
