export async function uploadLogo(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/logo/upload", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Errore upload logo");
  return data as { ok: boolean; logoUrl: string; icon192: string; icon512: string };
}
