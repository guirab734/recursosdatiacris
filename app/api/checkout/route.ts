import { failure, json, sameOrigin, rateLimit } from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "checkout", 10);
    return json(
      {
        error:
          "O checkout foi atualizado. Recarregue o carrinho para conferir a entrega e registrar seu pedido.",
      },
      410,
    );
  } catch (error) {
    return failure(error);
  }
}
