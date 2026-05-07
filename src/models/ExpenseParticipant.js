import Sequelize, { Model } from "sequelize";

class ExpenseParticipant extends Model {
  static init(sequelize) {
    super.init(
      {
        expense_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        share_amount: {
          type: Sequelize.DECIMAL(10, 2),
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
    this.belongsTo(models.Expense, { foreignKey: "expense_id", as: "expense" });
    this.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
  }
}

export default ExpenseParticipant;
