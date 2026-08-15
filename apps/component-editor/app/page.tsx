import Link from "next/link";

export default function HomePage() {
	return (
		<main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 p-8">
			<h1 className="font-semibold text-2xl">AnvilKit Component Editor</h1>
			<p className="text-muted-foreground">
				AI-agent-driven page building on the AnvilKit Studio runtime.
			</p>
			<Link className="underline underline-offset-4" href="/editor/draft-1">
				Open the editor
			</Link>
		</main>
	);
}
