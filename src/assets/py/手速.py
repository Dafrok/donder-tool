import math

def compute_weighted_average(a):
    """
    输入: a, 长度为 n+1 的列表或数组
    输出: 按照题目描述的加权平均值
    """
    n = len(a) - 1
    if n <= 0:
        raise ValueError("数组长度必须至少为2")

    # 1. 计算 b_i = a_i + a_{i+1}
    b = [a[i] + a[i+1] for i in range(n)]

    # b = []
    # for i in range(n):
    #     x_i = 2 * a[i]  # 第一个数
    #     y_i = a[i] + a[i+1]  # 第二个数
    #     weight_x = 2.0
    #     weight_y = 1.0
    #     # 计算加权调和平均值
    #     b_i = (weight_x + weight_y) / (weight_x / x_i + weight_y / y_i)
    #     b.append(b_i)

    # 2. 计算 c_i = 1000 / b_i
    c = [1000.0 / b_i for b_i in b]

    # 3. 对 c 排序并计算排名 (从1开始，不重复排名)
    sorted_indices = sorted(range(len(c)), key=lambda i: c[i])

    # 初始化排名数组
    rank = [0] * n
    for rank_num, idx in enumerate(sorted_indices, start=1):
        rank[idx] = rank_num

    # 4. 排名百分比 p_i = rank[i] / n
    p = [r / n for r in rank]

    # 5. 计算权重 w_i
    w = []
    for p_i in p:
        if p_i < 0.75:
            w.append(0.0)
        elif p_i > 0.95:
            w_i = 0.5 - 0.5 * math.cos(20 * math.pi * p_i)
            w.append(w_i)
        else:
            w_i = 0.5 * math.sin(5 * math.pi * p_i - 17 / 4 * math.pi) + 0.5
            w.append(w_i)

    # 6. 计算加权平均值
    numerator = sum(w_i * c_i for w_i, c_i in zip(w, c))
    denominator = sum(w)

    if abs(denominator) < 1e-12:
        return 0.0

    weighted_avg = numerator / denominator
    return weighted_avg


# 示例用法
if __name__ == "__main__":
    a = [1, 2, 3, 4, 5]
    result = compute_weighted_average(a)
    print(f"加权平均值: {result}")

    a2 = [10, 20, 30, 40, 50, 60]
    result2 = compute_weighted_average(a2)
    print(f"加权平均值: {result2}")
