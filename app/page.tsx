import AgentPlayground from "@/components/AgentPlayground";

export default function Home() {
  return (
    <div className="font-sans min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-orange-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20">
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl text-gray-900 dark:text-white">
            Make the image you truly want
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-muted-foreground leading-relaxed">
            An intelligent Gemini 2.5 Flash image-editing agent that iteratively refines your photos. Upload images, describe your vision, and watch as our AI agent critiques and improves each result until it perfectly matches your intent.
          </p>
        </div>

        <div className="w-full">
          <AgentPlayground />
        </div>
      </main>
    </div>
  );
}
