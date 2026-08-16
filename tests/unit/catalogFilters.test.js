const { publicProductWhere, publicServiceWhere } = require("../../utils/catalogFilters");
const { Op } = require("sequelize");

describe("catalogFilters", () => {
  test("public products include null type and treat null deleted as visible", () => {
    const where = publicProductWhere();
    expect(where[Op.and]).toEqual(
      expect.arrayContaining([
        { status: "approved" },
        { [Op.or]: [{ type: "product" }, { type: null }] }
      ])
    );
    const deleted = where[Op.and].find((c) => c[Op.or] && c[Op.or].some((x) => x.deleted === false));
    expect(deleted).toBeTruthy();
  });

  test("public services require type service and approved status", () => {
    const where = publicServiceWhere({ categoryId: 3 });
    expect(where[Op.and]).toEqual(
      expect.arrayContaining([{ status: "approved" }, { type: "service" }, { categoryId: 3 }])
    );
  });
});
