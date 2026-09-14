/**
 * One "row" of business data — either the document-level fields of an
 * invoice/packing list (invoice number, supplier, etc.) or a single
 * line item (description/quantity/unit price/total). Same shape either
 * way so PDF and Excel results compare cleanly later.
 */
export interface ExtractedFields {
  invoiceNumber?: string;
  poNumber?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalAmount?: number;
  currency?: string;
  subtotal?: number;
  tax?: number;
  grossWeight?: number;
  netWeight?: number;
  hsCode?: string;
  containerNumber?: string;
  shippingTerms?: string;
  supplier?: string;
  customer?: string;
  date?: string;
}

export interface StructuredDocument {
  /** Header-level fields that apply to the whole document. */
  documentFields: ExtractedFields;
  /** One entry per product/line row, when the document lists more than one. */
  lineItems: ExtractedFields[];
}
