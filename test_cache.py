import time
from backend.app.azure_svc import cached

@cached(ttl=600)
def my_func(account_id: int):
    return f"Result for {account_id}"

print(my_func(1))
print(my_func(2))
