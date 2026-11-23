import { NextRequest, NextResponse } from "next/server";
import { resolveCustomerDiscountPrice, resolveCustomerDiscountPriceBatch, SalesOrderPricingError } from "./service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerCode = searchParams.get("customerCode");
  const productId = searchParams.get("productId");
  const basePrice = searchParams.get("basePrice");

  if (!customerCode) {
    return NextResponse.json({ error: "customerCode is required" }, { status: 400 });
  }

  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  try {
    const result = await resolveCustomerDiscountPrice({
      customerCode,
      productId: Number(productId),
      basePrice: basePrice ? Number(basePrice) : null,
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Sales Order Pricing Error:", error);
    if (error instanceof SalesOrderPricingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerCode, items } = body || {};

    if (!customerCode) {
      return NextResponse.json({ error: "customerCode is required" }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const results = await resolveCustomerDiscountPriceBatch({ customerCode, items });
    return NextResponse.json({ data: results });
  } catch (error) {
    console.error("Sales Order Batch Pricing Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
