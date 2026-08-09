import Image from "next/image";
import Link from "next/link";

export default function ReceiptNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f3] px-4 text-[#24312f]">
      <section className="w-full max-w-xl rounded-xl border border-[#c9d7ce] bg-[#fcfbf6] p-7 text-center shadow-[0_5px_16px_rgba(36,49,47,0.08)] sm:p-10">
        <Image src="/lens-logo-horizontal.svg" alt="Lens TCG" width={126} height={36} className="mx-auto" />
        <p className="eyebrow mt-8 justify-center">Saved comparison</p>
        <h1 className="mt-3 font-serif text-3xl font-black">This receipt is unavailable.</h1>
        <p className="mt-3 text-sm leading-6 text-[#64736c]">It may have expired, or the shared receipt ID is not valid. Start a fresh live comparison to create a new one.</p>
        <Link href="/" className="primary-button mt-6 min-h-11 justify-center">Check a card</Link>
      </section>
    </main>
  );
}
