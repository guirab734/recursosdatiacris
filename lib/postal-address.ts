import "server-only";
import { HttpError } from "./http";
import type { CustomerAddress } from "./commerce-types";
export async function postalAddress(postalCode: string) {
  if (!/^\d{8}$/.test(postalCode))
    throw new HttpError(400, "Informe um CEP com oito números.");
  let data;
  try {
    const response = await fetch(
      `https://viacep.com.br/ws/${postalCode}/json/`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } },
    );
    if (!response.ok) throw new Error();
    data = await response.json();
  } catch {
    throw new HttpError(
      503,
      "Não foi possível consultar o CEP. Tente novamente em instantes.",
    );
  }
  if (data.erro || !data.localidade || !data.uf || !data.ibge)
    throw new HttpError(400, "CEP não encontrado. Confira o endereço.");
  return {
    postal_code: postalCode,
    street: String(data.logradouro || ""),
    neighborhood: String(data.bairro || ""),
    city: String(data.localidade),
    state: String(data.uf),
    local: String(data.ibge) === "2800308",
  };
}
export async function verifiedAddress(address: CustomerAddress) {
  const postal = await postalAddress(address.postal_code);
  return {
    address: { ...address, city: postal.city, state: postal.state },
    local: postal.local,
  };
}
