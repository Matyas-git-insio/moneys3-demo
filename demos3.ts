import {
  MoneyCustomerClient,
  MoneyCustomerError
} from "./money-customer";


const money =
  new MoneyCustomerClient({

    sourceXmlPath:
      "./moneys3new.xml",

    outputDirectory:
      "./imports"
  });


async function main() {

  console.log(
    "================================="
  );

  console.log(
    "MONEY S3 XML CUSTOMER TEST"
  );

  console.log(
    "================================="
  );


  console.log(
    "\n1. READ CUSTOMERS"
  );


  const page1 =
    await money.getCustomersPage(
      0,
      5
    );


  console.log(
    `Total customers in XML: ${page1.total}`
  );


  for (
    const customer
    of page1.items
  ) {

    console.log(
      customer.guid,
      customer.code,
      customer.name
    );
  }


  console.log(
    "\n2. PAGE 2"
  );


  const page2 =
    await money.getCustomersPage(
      5,
      5
    );


  for (
    const customer
    of page2.items
  ) {

    console.log(
      customer.guid,
      customer.code,
      customer.name
    );
  }


  console.log(
    "\n3. AUTOMATIC PAGINATION"
  );


  let count = 0;


  for await (
    const customer
    of money.iterateCustomers(5)
  ) {

    console.log(
      `${customer.code} | ${customer.name}`
    );


    count++;


    if (count >= 15) {
      break;
    }
  }


  console.log(
    `Read ${count} customers.`
  );


  console.log(
    "\n4. GENERATE CREATE XML"
  );


  const createFile =
    await money.createCustomerImport({

      code:
        "TS-TEST-001",

      name:
        "TypeScript Test Company",

      street:
        "Test Street 123",

      city:
        "Praha",

      postCode:
        "11000",

      country:
        "Česká republika",

      countryCode:
        "CZ",

      mobilePrefix:
        "+420",

      mobile:
        "123456789",

      physicalPerson:
        false,

      vatPayer:
        false
    });


  console.log(
    "CREATE import generated:"
  );


  console.log(
    createFile
  );


  console.log(
    "\nImport this XML manually into Money S3."
  );


  console.log(
    "\n================================="
  );

  console.log(
    "TEST COMPLETED"
  );

  console.log(
    "================================="
  );
}


main().catch(
  error => {

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
);