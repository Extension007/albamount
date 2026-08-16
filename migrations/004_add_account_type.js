'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.account_type && !table.accountType) {
      await queryInterface.addColumn('users', 'account_type', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'showcase'
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.account_type) {
      await queryInterface.removeColumn('users', 'account_type');
    }
  }
};
