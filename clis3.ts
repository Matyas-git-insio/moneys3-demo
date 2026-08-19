import {
  MoneyCustomerClient,
  MoneyCustomerError
} from "./money-customer";


import {
  createInterface
} from "readline/promises";


import {
  stdin as input,
  stdout as output
} from "process";


const money =
  new MoneyCustomerClient({

    sourceXmlPath:
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
MONEY S3 CUSTOMER CLI
========================================

h
help
?
    Show this help.


list
    Show first 10 customers.

list <page> <pageSize>

    Example:
    list 2 5


get <GUID|code|ICO>

    Example:
    get ZAM01


create "<code>" "<name>" "<city>"

    Example:
    create "TS001" "Test Company" "Praha"

    Creates an XML file in ./imports/


update <GUID|code|ICO> "<name>" "<city>"

    Example:
    update ZAM01 "Updated Company" "Brno"

    Creates an UPDATE XML file.


delete <GUID|code|ICO>

    Example:
    delete ZAM01

    Creates a DELETE XML file.
    It does NOT immediately delete anything from Money S3.


q
quit
exit

    Close the CLI.

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


  const file =
    await money.createCustomerImport({

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
    "\nCREATE XML generated:"
  );


  console.log(
    file
  );


  console.log(
    "\nImport this file into Money S3 using XML Import."
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


  const file =
    await money.updateCustomerImport(
      identifier,
      {

        name,

        city
      }
    );


  console.log(
    "\nUPDATE XML generated:"
  );


  console.log(
    file
  );


  console.log(
    "\nImport this file into Money S3 using XML Import."
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


  console.log(
    `GUID: ${customer.guid}`
  );


  const confirmation =
    await rl.question(
      "Generate DELETE import XML? (y/N): "
    );


  if (
    confirmation
      .trim()
      .toLowerCase()
    !== "y"
  ) {

    console.log(
      "Cancelled."
    );

    return;
  }


  const file =
    await money.deleteCustomerImport(
      identifier
    );


  console.log(
    "\nDELETE XML generated:"
  );


  console.log(
    file
  );


  console.log(
    "\nNothing has been deleted yet."
  );


  console.log(
    "The XML must still be imported into Money S3."
  );
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
MONEY S3 CUSTOMER CLI
========================================

Source:
./moneys3new.xml

Generated imports:
./imports/

Type "h" for available commands.
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
        error instanceof
        MoneyCustomerError
      ) {

        console.error(
          `Money error: ${error.message}`
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