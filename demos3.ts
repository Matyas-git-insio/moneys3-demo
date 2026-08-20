import {
  MoneyCustomerClient,
  MoneyCustomerError
} from "./money-customer";

import {
  MoneyInvoiceClient,
  MoneyInvoiceError
} from "./money-invoice";


const money =
  new MoneyCustomerClient({
    sourceXmlPath:
      "./moneys3new.xml",

    outputDirectory:
      "./imports"
  });


const invoices =
  new MoneyInvoiceClient({
    sourceXmlPath:
      "./money-invoices.xml",

    customerXmlPath:
      "./moneys3new.xml",

    outputDirectory:
      "./imports"
  });


async function main():
  Promise<void> {

  console.log(
    "========================================"
  );

  console.log(
    "MONEY S3 AUTOMATIC DEMO"
  );

  console.log(
    "========================================"
  );


  console.log(
    "\n1. SYNC CUSTOMERS"
  );

  await money.syncFromMoney();

  const customerPage =
    await money.getCustomersPage(
      0,
      5
    );

  console.log(
    `Customers: ${customerPage.total}`
  );

  for (
    const customer
    of customerPage.items
  ) {
    console.log(
      `${customer.code ?? "-"} | ${customer.name}`
    );
  }


  console.log(
    "\n2. SYNC INVOICES"
  );

  await invoices.syncFromMoney();


  console.log(
    "\n3. ISSUED INVOICES"
  );

  const issued =
    await invoices.getInvoicesPage(
      "issued",
      0,
      5
    );

  console.log(
    `Issued invoices: ${issued.total}`
  );

  for (
    const invoice
    of issued.items
  ) {
    console.log(
      `${invoice.documentNumber} | ${invoice.total ?? "-"} | ${invoice.partnerName ?? "-"} | ${invoice.description ?? ""}`
    );
  }


  console.log(
    "\n4. RECEIVED INVOICES"
  );

  const received =
    await invoices.getInvoicesPage(
      "received",
      0,
      5
    );

  console.log(
    `Received invoices: ${received.total}`
  );

  for (
    const invoice
    of received.items
  ) {
    console.log(
      `${invoice.documentNumber} | ${invoice.total ?? "-"} | ${invoice.partnerName ?? "-"} | ${invoice.description ?? ""}`
    );
  }


  console.log(
    "\n========================================"
  );

  console.log(
    "DEMO COMPLETED"
  );

  console.log(
    "========================================"
  );
}


main().catch(
  error => {
    if (
      error instanceof MoneyCustomerError ||
      error instanceof MoneyInvoiceError
    ) {
      console.error(
        `Money error:\n${error.message}`
      );

    } else {
      console.error(
        error
      );
    }
  }
);