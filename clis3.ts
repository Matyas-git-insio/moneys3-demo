import {
  MoneyCustomerClient,
  MoneyCustomerError
} from "./money-customer";

import {
  MoneyInvoiceClient,
  MoneyInvoiceError,
  MoneyInvoiceKind
} from "./money-invoice";

import {
  createInterface
} from "node:readline/promises";

import {
  stdin as input,
  stdout as output
} from "node:process";


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


const rl =
  createInterface({
    input,
    output
  });


function showHelp(): void {
  console.log(`
========================================
MONEY S3 AUTOMATIC CLI
========================================

CUSTOMERS
---------

sync
    Refresh customers from Money S3.

list [page] [pageSize]
    Example: list 1 10

get <GUID|code|ICO>
    Example: get OUT01

create "<code>" "<name>" "<city>"
    Example:
    create "TS001" "Test Company" "Praha"

update <GUID|code|ICO> "<name>" "<city>"
    Example:
    update TS001 "Updated Company" "Brno"

delete <GUID|code|ICO>
    Example:
    delete TS001


INVOICES
--------

invoices sync
    Refresh invoices from Money S3.

invoices list [issued|received|all] [page] [pageSize]
    Examples:
    invoices list issued
    invoices list received 1 10
    invoices list all 1 20

invoices get <issued|received> <document|GUID|variableSymbol>
    Example:
    invoices get issued 1026001

invoices create <issued|received> "<partnerCode>" "<description>" "<date>" "<dueDate>" "<item>" <qty> <grossUnitPrice> <vatRate> [variableSymbol]

    Example issued invoice:
    invoices create issued "OUT01" "TypeScript invoice" "2026-08-20" "2026-09-03" "Test service" 1 1210 21

    Example received invoice:
    invoices create received "OUT01" "Received TypeScript invoice" "2026-08-20" "2026-09-03" "Supplier service" 1 1210 21 2600999

invoices update <issued|received> <document|GUID|variableSymbol> "<description>" "<dueDate>"
    Example:
    invoices update issued 1026001 "Updated description" "2026-09-10"

invoices delete <issued|received> <document|GUID|variableSymbol>
    Example:
    invoices delete issued 1026001


OTHER
-----

h
help
?
    Show help.

q
quit
exit
    Exit.

========================================
`);
}


function parseCommand(
  line: string
): string[] {

  const matches =
    line.match(
      /(?:[^\s"]+|"[^"]*")+/g
    ) ?? [];

  return matches.map(
    value =>
      value.replace(
        /^"(.*)"$/,
        "$1"
      )
  );
}


function parseInvoiceKind(
  value: string | undefined
): MoneyInvoiceKind | null {

  if (
    value === "issued" ||
    value === "received"
  ) {
    return value;
  }

  return null;
}


async function syncCustomers():
  Promise<void> {

  const file =
    await money.syncFromMoney();

  console.log(
    `Fresh customer export saved to: ${file}`
  );
}


async function listCustomers(
  args: string[]
): Promise<void> {

  const page =
    Number(
      args[0] ?? 1
    );

  const pageSize =
    Number(
      args[1] ?? 10
    );

  if (
    !Number.isInteger(page) ||
    page < 1
  ) {
    console.log(
      "Page must be 1 or higher."
    );

    return;
  }

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1
  ) {
    console.log(
      "Page size must be 1 or higher."
    );

    return;
  }

  await money.syncFromMoney();

  const start =
    (page - 1) *
    pageSize;

  const result =
    await money.getCustomersPage(
      start,
      pageSize
    );

  console.log(
    `\nTotal customers: ${result.total}`
  );

  console.log(
    `Page: ${page}`
  );

  console.log(
    `Page size: ${pageSize}\n`
  );

  for (
    const customer
    of result.items
  ) {
    console.log(
      `${customer.guid ?? "-"} | ${customer.code ?? "-"} | ${customer.name}`
    );
  }

  console.log();
}


async function getCustomer(
  args: string[]
): Promise<void> {

  const identifier =
    args[0];

  if (!identifier) {
    console.log(
      "Usage: get <GUID|code|ICO>"
    );

    return;
  }

  await money.syncFromMoney();

  const customer =
    await money.getCustomer(
      identifier
    );

  if (!customer) {
    console.log(
      `Customer not found: ${identifier}`
    );

    return;
  }

  console.log(
    JSON.stringify(
      customer,
      null,
      2
    )
  );
}


async function createCustomer(
  args: string[]
): Promise<void> {

  const code =
    args[0];

  const name =
    args[1];

  const city =
    args[2];

  if (
    !code ||
    !name
  ) {
    console.log(
      'Usage: create "<code>" "<name>" "<city>"'
    );

    return;
  }

  console.log(
    "Creating customer automatically..."
  );

  const created =
    await money.createCustomer({
      code,
      name,
      city,
      country:
        "Česká republika",
      countryCode:
        "CZ",
      physicalPerson:
        false
    });

  console.log(
    "\nCustomer created successfully:"
  );

  console.log(
    JSON.stringify(
      created,
      null,
      2
    )
  );
}


async function updateCustomer(
  args: string[]
): Promise<void> {

  const identifier =
    args[0];

  const name =
    args[1];

  const city =
    args[2];

  if (
    !identifier ||
    !name
  ) {
    console.log(
      'Usage: update <GUID|code|ICO> "<name>" "<city>"'
    );

    return;
  }

  console.log(
    "Updating customer automatically..."
  );

  const updated =
    await money.updateCustomer(
      identifier,
      {
        name,
        city
      }
    );

  console.log(
    "\nCustomer updated successfully:"
  );

  console.log(
    JSON.stringify(
      updated,
      null,
      2
    )
  );
}


async function deleteCustomer(
  args: string[]
): Promise<void> {

  const identifier =
    args[0];

  if (!identifier) {
    console.log(
      "Usage: delete <GUID|code|ICO>"
    );

    return;
  }

  await money.syncFromMoney();

  const customer =
    await money.getCustomer(
      identifier
    );

  if (!customer) {
    console.log(
      `Customer not found: ${identifier}`
    );

    return;
  }

  console.log(
    `Customer: ${customer.name}`
  );

  console.log(
    `Code: ${customer.code}`
  );

  const confirmation =
    await rl.question(
      "Really delete this customer from Money S3? (y/N): "
    );

  if (
    confirmation
      .trim()
      .toLowerCase() !== "y"
  ) {
    console.log(
      "Cancelled."
    );

    return;
  }

  await money.deleteCustomer(
    identifier
  );

  console.log(
    "Customer deleted successfully."
  );
}


async function syncInvoices():
  Promise<void> {

  const file =
    await invoices.syncFromMoney();

  console.log(
    `Fresh invoice export saved to: ${file}`
  );
}


async function listInvoices(
  args: string[]
): Promise<void> {

  const kindText =
    args[0] ??
    "all";

  const kind =
    kindText === "all"
      ? undefined
      : parseInvoiceKind(
          kindText
        );

  if (
    kindText !== "all" &&
    kind === null
  ) {
    console.log(
      "Invoice type must be issued, received or all."
    );

    return;
  }

  const page =
    Number(
      args[1] ?? 1
    );

  const pageSize =
    Number(
      args[2] ?? 10
    );

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1
  ) {
    console.log(
      "Page and page size must be positive integers."
    );

    return;
  }

  await invoices.syncFromMoney();

  const result =
    await invoices.getInvoicesPage(
      kind ?? undefined,
      (page - 1) * pageSize,
      pageSize
    );

  console.log(
    `\nTotal invoices: ${result.total}`
  );

  console.log(
    `Page: ${page}`
  );

  console.log(
    `Page size: ${pageSize}\n`
  );

  for (
    const invoice
    of result.items
  ) {
    console.log(
      `${invoice.kind.padEnd(8)} | ${invoice.documentNumber.padEnd(10)} | VS ${invoice.variableSymbol ?? "-"} | ${invoice.total ?? "-"} | ${invoice.partnerName ?? "-"} | ${invoice.description ?? ""}`
    );
  }

  console.log();
}


async function getInvoice(
  args: string[]
): Promise<void> {

  const kind =
    parseInvoiceKind(
      args[0]
    );

  const identifier =
    args[1];

  if (
    !kind ||
    !identifier
  ) {
    console.log(
      "Usage: invoices get <issued|received> <document|GUID|variableSymbol>"
    );

    return;
  }

  await invoices.syncFromMoney();

  const invoice =
    await invoices.getInvoice(
      kind,
      identifier
    );

  if (!invoice) {
    console.log(
      `Invoice not found: ${identifier}`
    );

    return;
  }

  console.log(
    JSON.stringify(
      invoice,
      null,
      2
    )
  );
}


async function createInvoice(
  args: string[]
): Promise<void> {

  const kind =
    parseInvoiceKind(
      args[0]
    );

  const partnerCode =
    args[1];

  const description =
    args[2];

  const dateOfIssue =
    args[3];

  const dueDate =
    args[4];

  const itemDescription =
    args[5];

  const quantity =
    Number(
      args[6]
    );

  const unitPriceGross =
    Number(
      args[7]
    );

  const vatRate =
    Number(
      args[8]
    );

  const variableSymbol =
    args[9];

  if (
    !kind ||
    !partnerCode ||
    !description ||
    !dateOfIssue ||
    !dueDate ||
    !itemDescription ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(unitPriceGross) ||
    !Number.isFinite(vatRate)
  ) {
    console.log(
      "Usage: invoices create <issued|received> \"<partnerCode>\" \"<description>\" \"<date>\" \"<dueDate>\" \"<item>\" <qty> <grossUnitPrice> <vatRate> [variableSymbol]"
    );

    return;
  }

  console.log(
    "Refreshing customers for invoice partner data..."
  );

  await money.syncFromMoney();

  console.log(
    "Creating invoice automatically..."
  );

  const created =
    await invoices.createInvoice({
      kind,
      partnerCode,
      description,
      dateOfIssue,
      dueDate,
      variableSymbol,
      receivedDocumentNumber:
        kind === "received"
          ? variableSymbol
          : undefined,
      items: [
        {
          description:
            itemDescription,
          quantity,
          unitPriceGross,
          vatRate,
          unit:
            "ks"
        }
      ]
    });

  console.log(
    "\nInvoice created successfully:"
  );

  console.log(
    JSON.stringify(
      created,
      null,
      2
    )
  );
}


async function updateInvoice(
  args: string[]
): Promise<void> {

  const kind =
    parseInvoiceKind(
      args[0]
    );

  const identifier =
    args[1];

  const description =
    args[2];

  const dueDate =
    args[3];

  if (
    !kind ||
    !identifier ||
    !description
  ) {
    console.log(
      'Usage: invoices update <issued|received> <identifier> "<description>" "<dueDate>"'
    );

    return;
  }

  const updated =
    await invoices.updateInvoice(
      kind,
      identifier,
      {
        description,
        dueDate
      }
    );

  console.log(
    "\nInvoice updated successfully:"
  );

  console.log(
    JSON.stringify(
      updated,
      null,
      2
    )
  );
}


async function deleteInvoice(
  args: string[]
): Promise<void> {

  const kind =
    parseInvoiceKind(
      args[0]
    );

  const identifier =
    args[1];

  if (
    !kind ||
    !identifier
  ) {
    console.log(
      "Usage: invoices delete <issued|received> <identifier>"
    );

    return;
  }

  await invoices.syncFromMoney();

  const invoice =
    await invoices.getInvoice(
      kind,
      identifier
    );

  if (!invoice) {
    console.log(
      `Invoice not found: ${identifier}`
    );

    return;
  }

  console.log(
    `Invoice: ${invoice.documentNumber}`
  );

  console.log(
    `Partner: ${invoice.partnerName ?? "-"}`
  );

  console.log(
    `Total: ${invoice.total ?? "-"}`
  );

  const confirmation =
    await rl.question(
      "Really delete this invoice from Money S3? (y/N): "
    );

  if (
    confirmation
      .trim()
      .toLowerCase() !== "y"
  ) {
    console.log(
      "Cancelled."
    );

    return;
  }

  await invoices.deleteInvoice(
    kind,
    identifier
  );

  console.log(
    "Invoice deleted successfully."
  );
}


async function executeInvoiceCommand(
  args: string[]
): Promise<void> {

  const command =
    args
      .shift()
      ?.toLowerCase();

  switch (command) {
    case "sync":
      await syncInvoices();
      break;

    case "list":
      await listInvoices(
        args
      );
      break;

    case "get":
      await getInvoice(
        args
      );
      break;

    case "create":
      await createInvoice(
        args
      );
      break;

    case "update":
      await updateInvoice(
        args
      );
      break;

    case "delete":
      await deleteInvoice(
        args
      );
      break;

    default:
      console.log(
        "Unknown invoice command. Type h for help."
      );
      break;
  }
}


async function executeCommand(
  line: string
): Promise<boolean> {

  const args =
    parseCommand(
      line.trim()
    );

  const command =
    args
      .shift()
      ?.toLowerCase();

  if (!command) {
    showHelp();
    return true;
  }

  switch (command) {
    case "h":
    case "help":
    case "?":
      showHelp();
      break;

    case "sync":
      await syncCustomers();
      break;

    case "list":
      await listCustomers(
        args
      );
      break;

    case "get":
      await getCustomer(
        args
      );
      break;

    case "create":
      await createCustomer(
        args
      );
      break;

    case "update":
      await updateCustomer(
        args
      );
      break;

    case "delete":
      await deleteCustomer(
        args
      );
      break;

    case "invoices":
      await executeInvoiceCommand(
        args
      );
      break;

    case "q":
    case "quit":
    case "exit":
      return false;

    default:
      console.log(
        `Unknown command: ${command}`
      );

      showHelp();
      break;
  }

  return true;
}


async function main():
  Promise<void> {

  console.log(`
========================================
MONEY S3 AUTOMATIC CLI
========================================

Customers: ./moneys3new.xml
Invoices:  ./money-invoices.xml

Type "h" for commands.
`);

  while (true) {
    const line =
      await rl.question(
        "money> "
      );

    try {
      const continueRunning =
        await executeCommand(
          line
        );

      if (!continueRunning) {
        break;
      }

    } catch (error) {
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
  }

  rl.close();

  console.log(
    "Money S3 CLI closed."
  );
}


main().catch(
  error => {
    console.error(
      error
    );

    rl.close();
  }
);