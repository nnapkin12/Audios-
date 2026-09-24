import { openExternal } from "@/lib/api";
import { GITHUB_URL } from "@/lib/links";

export function LibraryHome() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-16">
      <img
        src="/audios.png"
        alt="Audios!"
        className="w-full max-w-[360px] rounded-2xl bg-white object-contain shadow-[0_18px_40px_rgb(0_0_0_/_0.35)]"
      />
      <h1 className="mt-8 text-[42px] font-semibold tracking-tight text-app-text">Audios!</h1>
      <p className="mt-3 max-w-lg text-center text-[15px] font-medium leading-6 text-app-muted">
        Audios! takes a folder of audio files and plays them as a library. Artwork, artists, and albums come from the tags in those files.
      </p>
      <button
        type="button"
        onClick={() => void openExternal(GITHUB_URL)}
        className="mt-4 text-[14px] font-semibold text-app-accent underline-offset-2 hover:underline"
      >
        Star this on GitHub
      </button>
    </div>
  );
}
