import Sequelize, { Model } from "sequelize";

class Expense extends Model {
  static init(sequelize) {
    super.init(
      {
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        value: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
        },
        currency: {
          type: Sequelize.STRING(10),
          allowNull: false,
          defaultValue: "USD",
        },
        date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        paid_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
      },
      {
        sequelize,
        timestamps: true,
      }
    );

    return this;
  }

  static associate(models) {
    this.belongsTo(models.User, { foreignKey: "paid_by", as: "paidByUser" });
    this.hasMany(models.ExpenseParticipant, {
      foreignKey: "expense_id",
      as: "participants",
      onDelete: "CASCADE",
    });
  }
}

export default Expense;
